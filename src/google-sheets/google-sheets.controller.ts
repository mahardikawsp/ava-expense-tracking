import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service';
import { CreateGoogleSheetDto } from './dto/create-google-sheet.dto';
import { UpdateGoogleSheetDto } from './dto/update-google-sheet.dto';

@Controller('google-sheets')
export class GoogleSheetsController {
  constructor(private readonly googleSheetsService: GoogleSheetsService) { }
}
