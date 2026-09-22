import { Controller, Get, Injectable, Inject } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
@Injectable()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
