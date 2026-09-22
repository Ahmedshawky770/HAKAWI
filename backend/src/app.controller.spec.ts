import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  controllers: [AppController],
  providers: [AppService],
})
class TestModule {}

describe('AppController', () => {
  let appController: AppController;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    appController = moduleRef.get<AppController>(AppController);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
