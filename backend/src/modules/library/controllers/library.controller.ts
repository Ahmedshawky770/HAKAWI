import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { LibraryService } from '../library.service.ts';
import { AddToLibraryDto, LibraryQueryDto } from '../dto/library.dto.ts';
import type { LibraryQuery } from '../types.ts';

@Controller('library')
export class LibraryController {
  constructor(@Inject(LibraryService) private readonly libraryService: LibraryService) {}

  /**
   * `POST /library` IS REMOVED, AND ITS ABSENCE IS THE POINT.
   *
   * The route accepted `{ bookId }` and wrote a `library` row with `status: 'owned'`, with no check
   * that the book was free, no check that a payment had completed, and no check that the book existed
   * for sale. So `POST /api/v1/library { "bookId": "<any uuid in the catalogue>" }` granted permanent
   * ownership of a paid book to any authenticated account, for nothing. It was the only route to an
   * entitlement at all, because the payment path never granted one — which is why the hole and the
   * defect were the same hole seen from two ends.
   *
   * The entitlement is now granted in exactly one place: `LibraryEventHandler.handlePaymentCompleted`,
   * from a stored completed payment. A FREE book is claimed through `POST /library/claim`, which
   * verifies `is_free` first; a paid book arrives only through money.
   *
   * `LibraryService.addToLibrary` is retained as the single write path and is now called only by those
   * two callers. It is no longer reachable from HTTP, which is the whole change.
   */

  /**
   * `POST /library/claim` — add a genuinely FREE book to the reader's library.
   *
   * WHY THIS ROUTE EXISTS RATHER THAN LEAVING THE USER WITH NO WAY TO START. `books.is_free` defaults
   * to `true` (`db/schema/books.schema.ts`), so free books are the default state of the catalogue. The
   * removed route was how a reader got one; without a replacement, a reader could not obtain any book
   * that was free, which is a different failure from the one being fixed.
   *
   * WHY IT IS NOT THE OLD ROUTE. The service re-reads the book and refuses anything with `is_free`
   * false, so this cannot be used to obtain a paid book. The check lives in the service, not here,
   * because a controller-level check is bypassed by any other caller — and the service has two other
   * callers that are allowed to bypass it deliberately (the payment grant).
   */
  @UseGuards(JwtAuthGuard)
  @Post('claim')
  @HttpCode(HttpStatus.CREATED)
  async claimFreeBook(@Body() dto: AddToLibraryDto, @Request() req: Request & { user: { sub: string } }) {
    return this.libraryService.claimFreeBook(req.user.sub, dto.bookId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findMyLibrary(@Query() query: LibraryQueryDto, @Request() req: Request & { user: { sub: string } }) {
    const libraryQuery: LibraryQuery = { ...query, userId: req.user.sub };
    return this.libraryService.findMyLibrary(req.user.sub, libraryQuery);
  }

  @UseGuards(JwtAuthGuard)
  @Get('count')
  async count(@Request() req: Request & { user: { sub: string } }) {
    return this.libraryService.count(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/access')
  @HttpCode(HttpStatus.OK)
  async accessItem(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    return this.libraryService.accessItem(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromLibrary(@Param('id') id: string, @Request() req: Request & { user: { sub: string } }) {
    await this.libraryService.removeFromLibrary(id, req.user.sub);
  }
}
