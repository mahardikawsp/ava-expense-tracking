import { PartialType } from '@nestjs/mapped-types';
import { CreateGoogleSheetDto } from './create-google-sheet.dto';

export class UpdateGoogleSheetDto extends PartialType(CreateGoogleSheetDto) {}
