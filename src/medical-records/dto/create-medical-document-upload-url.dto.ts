import { IsString, IsInt, Max, Matches, IsIn } from 'class-validator';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export class CreateMedicalDocumentUploadUrlDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9-_. ]+$/, {
    message: 'Filename contains invalid characters',
  })
  original_filename: string;

  @IsString()
  @IsIn(ALLOWED_MIME_TYPES, {
    message: `Invalid mime type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
  })
  mime_type: string;

  @IsInt()
  @Max(10 * 1024 * 1024) // 10 MB in bytes
  file_size_bytes: number;
}
