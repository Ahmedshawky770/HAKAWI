import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiBadRequestResponse, ApiConflictResponse, ApiNoContentResponse, ApiInternalServerErrorResponse, ApiTooManyRequestsResponse, ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';

export const ApiCommonResponses = applyDecorators(
  ApiOkResponse({ description: 'Successful response' }),
  ApiUnauthorizedResponse({ description: 'Unauthorized - invalid or missing JWT token' }),
  ApiForbiddenResponse({ description: 'Forbidden - insufficient permissions' }),
  ApiInternalServerErrorResponse({ description: 'Internal server error' }),
  ApiTooManyRequestsResponse({ description: 'Too many requests - rate limit exceeded' }),
);

export const ApiStandardResponses = applyDecorators(
  ApiCommonResponses,
  ApiBadRequestResponse({ description: 'Invalid request parameters or validation failed' }),
  ApiNotFoundResponse({ description: 'Resource not found' }),
  ApiConflictResponse({ description: 'Resource conflict - duplicate or constraint violation' }),
);

export const ApiAuthTag = () => ApiTags('Auth');
export const ApiUsersTag = () => ApiTags('Users');
export const ApiStoriesTag = () => ApiTags('Stories');
export const ApiCategoriesTag = () => ApiTags('Categories');
export const ApiTagsTag = () => ApiTags('Tags');
export const ApiSearchTag = () => ApiTags('Search');
export const ApiFollowsTag = () => ApiTags('Follows');
export const ApiReactionsTag = () => ApiTags('Reactions');
export const ApiCommentsTag = () => ApiTags('Comments');
export const ApiNotificationsTag = () => ApiTags('Notifications');
export const ApiMessagesTag = () => ApiTags('Messages');
export const ApiUploadTag = () => ApiTags('Upload');
export const ApiModerationTag = () => ApiTags('Moderation');
export const ApiBooksTag = () => ApiTags('Books');
export const ApiPaymentsTag = () => ApiTags('Payments');
export const ApiRentalsTag = () => ApiTags('Rentals');
export const ApiLibraryTag = () => ApiTags('Library');
export const ApiContestsTag = () => ApiTags('Contests');

export const ApiAuth = () => ApiBearerAuth('access-token');
export const ApiAuthOperation = (summary: string, description?: string) => ApiOperation({ summary, description });
export const ApiIdParam = () => ApiParam({ name: 'id', description: 'Resource UUID', type: String });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ApiPaginatedResponse = (model: new (...args: any[]) => any) =>
  applyDecorators(
    ApiOkResponse({
      description: 'Paginated list of resources',
      schema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: `#/components/schemas/${model.name}` } },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'number' },
              limit: { type: 'number' },
              total: { type: 'number' },
              totalPages: { type: 'number' },
            },
          },
        },
      },
    }),
  );
