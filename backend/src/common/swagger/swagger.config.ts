import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

export const SWAGGER_API_PATH = 'api/docs';
export const SWAGGER_TITLE = 'Hakawi API';
export const SWAGGER_DESCRIPTION = 'OpenAPI 3.0 documentation for Hakawi backend API';
export const SWAGGER_VERSION = '1.0.0';

export const createSwaggerDocument = (app: INestApplication) => {
  const config = new DocumentBuilder()
    .setTitle(SWAGGER_TITLE)
    .setDescription(SWAGGER_DESCRIPTION)
    .setVersion(SWAGGER_VERSION)
    .setContact('Hakawi Team', 'https://hakawi.app', 'support@hakawi.app')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token obtained from /auth/login',
      },
      'access-token',
    )
    .addTag('Auth', 'Authentication and authorization endpoints')
    .addTag('Users', 'User profile and account management')
    .addTag('Stories', 'Story CRUD and publishing operations')
    .addTag('Categories', 'Story categories management')
    .addTag('Tags', 'Story tags management')
    .addTag('Search', 'Global search across stories, authors, and categories')
    .addTag('Follows', 'User follow and unfollow operations')
    .addTag('Reactions', 'Story reactions and reaction counts')
    .addTag('Comments', 'Story comments and comment threads')
    .addTag('Notifications', 'User notifications and preferences')
    .addTag('Messages', 'Direct messaging and conversations')
    .addTag('Upload', 'File upload and presigned URL generation')
    .addTag('Moderation', 'Content moderation, reports, and admin dashboard')
    .addTag('Books', 'Digital books CRUD, publishing, and downloads')
    .addTag('Payments', 'Payment processing and refunds')
    .addTag('Rentals', 'Book rental and return operations')
    .addTag('Library', 'Personal library management')
    .addTag('Contests', 'Writing contests, submissions, voting, and prizes')
    .build();

  return SwaggerModule.createDocument(app, config);
};

export const setupSwagger = (app: INestApplication) => {
  const document = createSwaggerDocument(app);
  SwaggerModule.setup(SWAGGER_API_PATH, app, document, {
    explorer: true,
    customSiteTitle: SWAGGER_TITLE,
    customCss: '.topbar { display: none }',
  });
};
