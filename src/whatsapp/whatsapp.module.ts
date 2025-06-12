import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';
import { OpenaiModule } from '../openai/openai.module';

@Module({
  imports: [GoogleSheetsModule, OpenaiModule],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule { }