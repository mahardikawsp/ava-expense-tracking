import { Test, TestingModule } from '@nestjs/testing';
import { GoogleSheetsController } from './google-sheets.controller';
import { GoogleSheetsService } from './google-sheets.service';

describe('GoogleSheetsController', () => {
  let controller: GoogleSheetsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleSheetsController],
      providers: [GoogleSheetsService],
    }).compile();

    controller = module.get<GoogleSheetsController>(GoogleSheetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
