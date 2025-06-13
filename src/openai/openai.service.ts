import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as moment from 'moment';
import OpenAI from 'openai';

@Injectable()
export class OpenaiService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async categorizeTransaction(description: string, type: string): Promise<string> {
    try {
      const prompt = `Kategorikan transaksi berikut dalam bahasa Indonesia:

  Jenis: ${type}
  Deskripsi: ${description}

  Untuk PEMASUKAN, pilih salah satu kategori berikut:
  - Gaji
  - Freelance
  - Bisnis
  - Investasi
  - Bonus
  - Hadiah
  - Lainnya

  Untuk PENGELUARAN, pilih salah satu kategori berikut:
  - Makanan & Minuman
  - Transportasi
  - Belanja
  - Tagihan
  - Kesehatan
  - Hiburan
  - Pendidikan
  - Investasi
  - Lainnya

  Jawab hanya dengan nama kategori saja, tanpa penjelasan tambahan.`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 50,
        temperature: 0.3,
      });

      const category = completion.choices[0]?.message?.content?.trim();
      return category || 'Lainnya';

    } catch (error) {
      console.error('Error categorizing transaction with OpenAI:', error);
      return 'Lainnya'; // Default category if API fails
    }
  }
  async interpretDataQuery(query: string): Promise<any> {
    try {
      const prompt = `Analisis query berikut dan tentukan periode waktu yang diminta:

Query: "${query}"

Berdasarkan query tersebut, tentukan:
1. Periode waktu (hari ini, kemarin, minggu ini, bulan ini, tahun ini, dll)
2. Tanggal mulai (format DD/MM/YYYY)
3. Tanggal akhir (format DD/MM/YYYY)
4. Jenis data yang diminta (pengeluaran, pemasukan, atau keduanya)

Tanggal hari ini: ${moment().format('DD/MM/YYYY')}
Hari: ${moment().format('dddd')}

Jawab dalam format JSON seperti ini:
{
"period": "minggu ini",
"startDate": "06/06/2025",
"endDate": "12/06/2025",
"type": "expense|income|both",
"intent": "summary|total|balance"
}

Jika query tidak jelas atau tidak berkaitan dengan data keuangan, return null.`;
      console.log(prompt, 'prompt ai')

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      const response = completion.choices[0]?.message?.content?.trim();
      console.log(response, 'apa responya')

      if (!response || response === 'null') {
        return null;
      }

      try {
        return JSON.parse(response);
      } catch {
        return null;
      }

    } catch (error) {
      console.error('Error interpreting data query with OpenAI:', error);
      return null;
    }
  }
}