import { PartialType } from '@nestjs/mapped-types';
import { CreateOpenaiDto } from './create-openai.dto';

export class UpdateOpenaiDto extends PartialType(CreateOpenaiDto) {}
