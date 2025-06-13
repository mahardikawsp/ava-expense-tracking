import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';
import * as moment from 'moment';

interface TransactionData {
  date: string;
  time: string;
  type: string;
  amount: number;
  description: string;
  category: string;
  source: string;
  pocket: string;
  sender: string
}

@Injectable()
export class GoogleSheetsService {
  private sheets;
  private spreadsheetId: string;

  constructor(private configService: ConfigService) {
    const spreadsheetId = this.configService.get<string>('GOOGLE_SHEETS_SPREADSHEET_ID');
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not defined in environment variables');
    }
    this.spreadsheetId = spreadsheetId;
    this.initializeGoogleSheets();
  }

  private async initializeGoogleSheets() {
    const privateKeyRaw = this.configService.get<string>('GOOGLE_SHEETS_PRIVATE_KEY');
    const clientEmail = this.configService.get<string>('GOOGLE_SHEETS_CLIENT_EMAIL');

    if (!privateKeyRaw) {
      throw new Error('GOOGLE_SHEETS_PRIVATE_KEY is not defined in environment variables');
    }
    if (!clientEmail) {
      throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL is not defined in environment variables');
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        private_key: privateKey,
        client_email: clientEmail,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });

    // Initialize sheet headers if needed
    await this.initializeHeaders();
  }

  // private async initializeHeaders() {
  //   try {
  //     const headers = [
  //       'Date',
  //       'Time',
  //       'Type',
  //       'Amount',
  //       'Description',
  //       'Category',
  //       'Source'
  //     ];

  //     // Check if headers exist
  //     const response = await this.sheets.spreadsheets.values.get({
  //       spreadsheetId: this.spreadsheetId,
  //       range: 'A1:G1',
  //     });

  //     if (!response.data.values || response.data.values.length === 0) {
  //       // Add headers
  //       await this.sheets.spreadsheets.values.update({
  //         spreadsheetId: this.spreadsheetId,
  //         range: 'A1:G1',
  //         valueInputOption: 'USER_ENTERED',
  //         requestBody: {
  //           values: [headers],
  //         },
  //       });
  //       console.log('Headers initialized in Google Sheets');
  //     }
  //   } catch (error) {
  //     console.error('Error initializing headers:', error);
  //   }
  // }

  // async addTransaction(data: TransactionData): Promise<void> {
  //   try {
  //     const values = [
  //       [
  //         data.date,
  //         data.time,
  //         data.type,
  //         data.amount,
  //         data.description,
  //         data.category,
  //         data.source
  //       ]
  //     ];

  //     await this.sheets.spreadsheets.values.append({
  //       spreadsheetId: this.spreadsheetId,
  //       range: 'A:G',
  //       valueInputOption: 'USER_ENTERED',
  //       insertDataOption: 'INSERT_ROWS',
  //       requestBody: {
  //         values,
  //       },
  //     });

  //     console.log('Transaction added to Google Sheets:', data);
  //   } catch (error) {
  //     console.error('Error adding transaction to Google Sheets:', error);
  //     throw error;
  //   }
  // }

  // async getTransactions(limit: number = 100): Promise<any[]> {
  //   try {
  //     const response = await this.sheets.spreadsheets.values.get({
  //       spreadsheetId: this.spreadsheetId,
  //       range: `A2:G${limit + 1}`, // Skip header row
  //     });

  //     return response.data.values || [];
  //   } catch (error) {
  //     console.error('Error getting transactions from Google Sheets:', error);
  //     throw error;
  //   }
  // }
  private async initializeHeaders() {
    try {
      const headers = [
        'Date',
        'Time',
        'Type',
        'Amount',
        'Description',
        'Category',
        'Pocket',
        'Source',
        'Sender'
      ];

      // Check if headers exist
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A1:I1',
      });

      if (!response.data.values || response.data.values.length === 0) {
        // Add headers
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: 'A1:I1',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [headers],
          },
        });
        console.log('Headers initialized in Google Sheets');
      }
    } catch (error) {
      console.error('Error initializing headers:', error);
    }
  }

  async addTransaction(data: TransactionData): Promise<void> {
    try {
      const values = [
        [
          data.date,
          data.time,
          data.type,
          data.amount,
          data.description,
          data.category,
          data.pocket,
          data.source,
          data.sender
        ]
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'A:I',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values,
        },
      });

      console.log('Transaction added to Google Sheets:', data);
    } catch (error) {
      console.error('Error adding transaction to Google Sheets:', error);
      throw error;
    }
  }

  async getTransactions(limit: number = 1000): Promise<any[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `A2:I${limit + 1}`, // Skip header row
      });

      const rawData = response.data.values || [];

      // Convert to structured objects
      return rawData.map(row => ({
        date: row[0] || '',
        time: row[1] || '',
        type: row[2] || '',
        amount: row[3] || '0',
        description: row[4] || '',
        category: row[5] || '',
        pocket: row[6] || 'default',
        source: row[7] || '',
        sender: row[8] || 'anonimous'
      }));
    } catch (error) {
      console.error('Error getting transactions from Google Sheets:', error);
      throw error;
    }
  }

  async getPocketBalance(pocketName: string): Promise<number> {
    try {
      const transactions = await this.getTransactions();

      return transactions
        .filter(t => t.pocket.toLowerCase() === pocketName.toLowerCase())
        .reduce((balance, t) => {
          const amount = parseFloat(t.amount || '0');
          return t.type === 'Income' ? balance + amount : balance - amount;
        }, 0);
    } catch (error) {
      console.error('Error getting pocket balance:', error);
      throw error;
    }
  }

  async getAllPocketBalances(): Promise<{ [key: string]: number }> {
    try {
      const transactions = await this.getTransactions();
      const pocketBalances: { [key: string]: number } = {};

      transactions.forEach(t => {
        const pocket = t.pocket || 'default';
        const amount = parseFloat(t.amount || '0');
        const sender = t.sender

        if (!pocketBalances[pocket]) {
          pocketBalances[pocket] = 0;
        }

        pocketBalances[pocket] += t.type === 'Income' ? amount : -amount;
        pocketBalances[sender] = sender
      });

      return pocketBalances;
    } catch (error) {
      console.error('Error getting all pocket balances:', error);
      throw error;
    }
  }

  async getAllPocketBalancesWithSenders(): Promise<{ [key: string]: { balance: number; sender: string } }> {
    try {
      const transactions = await this.getTransactions();
      const pocketData: { [key: string]: { balance: number; sender: string } } = {};

      transactions.forEach(t => {
        const pocket = t.pocket || 'default';
        const amount = parseFloat(t.amount || '0');
        const sender = t.sender || 'anonimous';

        if (!pocketData[pocket]) {
          pocketData[pocket] = { balance: 0, sender: sender };
        }

        pocketData[pocket].balance += t.type === 'Income' ? amount : -amount;
        // Keep the most recent sender for this pocket
        pocketData[pocket].sender = sender;
      });

      return pocketData;
    } catch (error) {
      console.error('Error getting all pocket balances with senders:', error);
      throw error;
    }
  }

  async getRecentPocketTransactions(pocketName: string, limit: number = 10): Promise<any[]> {
    try {
      const transactions = await this.getTransactions();

      return transactions
        .filter(t => t.pocket.toLowerCase() === pocketName.toLowerCase())
        .slice(-limit)
        .reverse(); // Most recent first
    } catch (error) {
      console.error('Error getting recent pocket transactions:', error);
      throw error;
    }
  }

  async getPocketTransactionsInRange(pocketName: string, startDate: string, endDate: string): Promise<any[]> {
    try {
      const transactions = await this.getTransactionsInRange(startDate, endDate);

      return transactions.filter(t =>
        t.pocket.toLowerCase() === pocketName.toLowerCase()
      );
    } catch (error) {
      console.error('Error getting pocket transactions in range:', error);
      throw error;
    }
  }

  async getTransactionsInRange(startDate: string, endDate: string): Promise<any[]> {
    try {
      const allTransactions = await this.getTransactions();

      const start = moment(startDate, 'DD/MM/YYYY');
      const end = moment(endDate, 'DD/MM/YYYY');

      return allTransactions.filter(transaction => {
        if (!transaction.date) return false;

        const transactionDate = moment(transaction.date, 'DD/MM/YYYY');
        return transactionDate.isBetween(start, end, 'day', '[]'); // inclusive
      });
    } catch (error) {
      console.error('Error getting transactions in range:', error);
      throw error;
    }
  }

  async getTransactionsByCategory(category: string, days: number = 30): Promise<any[]> {
    try {
      const endDate = moment();
      const startDate = moment().subtract(days, 'days');

      const transactions = await this.getTransactionsInRange(
        startDate.format('DD/MM/YYYY'),
        endDate.format('DD/MM/YYYY')
      );

      return transactions.filter(t =>
        t.category && t.category.toLowerCase().includes(category.toLowerCase())
      );
    } catch (error) {
      console.error('Error getting transactions by category:', error);
      throw error;
    }
  }

  async getTotalsByPeriod(type: 'Income' | 'Expense', startDate: string, endDate: string): Promise<number> {
    try {
      const transactions = await this.getTransactionsInRange(startDate, endDate);

      return transactions
        .filter(t => t.type === type)
        .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
    } catch (error) {
      console.error('Error getting totals by period:', error);
      throw error;
    }
  }
}