import { AppService } from './app.service.ts';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHello(): string;
}
