import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { OpenaiService } from '../openai/openai.service';
import * as moment from 'moment';

@Injectable()
export class WhatsappService implements OnModuleInit {
    private client: Client;

    constructor(
        private readonly googleSheetsService: GoogleSheetsService,
        private readonly openaiService: OpenaiService,
    ) {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
        });
    }

    async onModuleInit() {
        await this.initializeWhatsApp();
    }

    private async initializeWhatsApp() {
        this.client.on('qr', (qr) => {
            console.log('QR Code received, scan with your phone:');
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', () => {
            console.log('WhatsApp bot is ready!');
        });

        this.client.on('message', async (message: Message) => {
            await this.handleMessage(message);
        });

        this.client.on('authenticated', () => {
            console.log('WhatsApp authenticated successfully');
        });

        this.client.on('auth_failure', (msg) => {
            console.error('Authentication failed:', msg);
        });

        this.client.on('disconnected', (reason) => {
            console.log('WhatsApp disconnected:', reason);
        });

        await this.client.initialize();
    }

    private async handleMessage(message: Message) {
        const body = message.body.trim().toLowerCase();

        // Check if message starts with /pemasukan or /pengeluaran
        if (body.startsWith('/pemasukan') || body.startsWith('/pengeluaran')) {
            await this.processFinanceMessage(message);
        }
        // Check for data queries
        else if (this.isDataQuery(body)) {
            console.log('masuk data query');
            await this.processDataQuery(message);
        }
        // Help command
        else if (body === '/help' || body === '/bantuan') {
            console.log('masuk sini help')
            await this.sendHelpMessage(message);
        }
    }

    private isDataQuery(body: string): boolean {
        const dataKeywords = [
            'berapa', 'total', 'jumlah', 'pengeluaran', 'pemasukan',
            'minggu', 'bulan', 'tahun', 'hari', 'kemarin', 'laporan',
            'ringkasan', 'summary', 'saldo', 'balance', 'pocket'
        ];

        return dataKeywords.some(keyword => body.includes(keyword));
    }

    private async processDataQuery(message: Message) {
        try {
            const body = message.body.trim().toLowerCase();

            // Check for pocket balance queries
            if (body.includes('saldo pocket') || body.includes('balance pocket')) {
                await this.processPocketBalanceQuery(message);
                return;
            }

            // Check for pocket management commands
            if (body.includes('list pocket') || body.includes('daftar pocket')) {
                await this.processPocketListQuery(message);
                return;
            }

            // Check for transfer between pockets
            if (body.includes('transfer') && body.includes('pocket')) {
                await this.processPocketTransfer(message);
                return;
            }

            // Regular data queries
            const queryIntent = await this.openaiService.interpretDataQuery(message.body.trim());

            if (!queryIntent) {
                await message.reply(`Maaf, saya tidak mengerti permintaan Anda. 
    
    🔍 Perintah yang tersedia:
    • "Berapa pengeluaran minggu ini?"
    • "Saldo pocket utama"
    • "List pocket"
    • "Transfer 100rb dari pocket utama ke pocket harian"
    
    Ketik /help untuk melihat semua perintah.`);
                return;
            }

            // Get data from Google Sheets
            const transactions = await this.googleSheetsService.getTransactionsInRange(
                queryIntent.startDate,
                queryIntent.endDate
            );

            // Generate report
            const report = this.generateReport(transactions, queryIntent);
            await message.reply(report);

        } catch (error) {
            console.error('Error processing data query:', error);
            await message.reply('Terjadi kesalahan saat mengambil data. Silakan coba lagi.');
        }
    }

    private async processPocketBalanceQuery(message: Message) {
        try {
            const body = message.body.trim();
            const pocketName = this.extractPocketName(body);

            if (!pocketName) {
                // Show all pockets
                const pocketSummary = await this.googleSheetsService.getAllPocketBalances();
                console.log(pocketSummary, 'pocket summary')
                let response = '👝 SALDO SEMUA POCKET:\n\n';

                let totalBalance = 0;
                Object.entries(pocketSummary).forEach(([pocket, balance]) => {
                    response += `💰 ${pocket}: Rp ${balance.toLocaleString('id-ID')}\n`;
                    totalBalance += balance;
                });

                response += `\n💎 Total Keseluruhan: Rp ${totalBalance.toLocaleString('id-ID')}`;
                response += '\n\n💡 Tip: Ketik "saldo pocket [nama]" untuk detail pocket tertentu';

                await message.reply(response);
            } else {
                // Show specific pocket
                const balance = await this.googleSheetsService.getPocketBalance(pocketName);
                const recentTransactions = await this.googleSheetsService.getRecentPocketTransactions(pocketName, 5);
                console.log(recentTransactions, 'recent')

                let response = `👝 POCKET: ${pocketName.toUpperCase()}\n`;
                response += `💰 Saldo: Rp ${balance.toLocaleString('id-ID')}\n\n`;

                if (recentTransactions.length > 0) {
                    response += '📋 TRANSAKSI TERAKHIR:\n';
                    recentTransactions.forEach(t => {
                        const icon = t.type === 'Income' ? '📈' : '📉';
                        response += `${icon} ${t.date} - Rp ${parseFloat(t.amount).toLocaleString('id-ID')} (${t.description})\n`;
                    });
                }

                await message.reply(response);
            }
        } catch (error) {
            console.error('Error processing pocket balance query:', error);
            await message.reply('Terjadi kesalahan saat mengambil saldo pocket.');
        }
    }

    private async processPocketListQuery(message: Message) {
        try {
            const pocketSummary = await this.googleSheetsService.getAllPocketBalances();

            let response = '📝 DAFTAR POCKET:\n\n';
            Object.entries(pocketSummary).forEach(([pocket, balance]) => {
                const status = balance > 0 ? '✅' : balance === 0 ? '⚪' : '❌';
                response += `${status} ${pocket}: Rp ${balance.toLocaleString('id-ID')}\n`;
            });

            response += '\n💡 Tips:\n';
            response += '• Ketik "saldo pocket [nama]" untuk detail\n';
            response += '• Pocket otomatis dibuat saat transaksi pertama\n';
            response += '• Gunakan nama pocket yang mudah diingat';

            await message.reply(response);
        } catch (error) {
            console.error('Error processing pocket list query:', error);
            await message.reply('Terjadi kesalahan saat mengambil daftar pocket.');
        }
    }

    private async processPocketTransfer(message: Message) {
        try {
            const body = message.body.trim();
            const transferData = this.parseTransferCommand(body);

            if (!transferData) {
                await message.reply(`Format transfer tidak valid. Gunakan:
    "Transfer [jumlah] dari pocket [asal] ke pocket [tujuan]"
    
    Contoh:
    • Transfer 100rb dari pocket utama ke pocket harian
    • Transfer 50k dari pocket bulanan ke pocket darurat`);
                return;
            }

            const { amount, fromPocket, toPocket } = transferData;

            // Check source pocket balance
            const fromBalance = await this.googleSheetsService.getPocketBalance(fromPocket);
            if (fromBalance < amount) {
                await message.reply(`❌ Transfer gagal!
    Saldo pocket "${fromPocket}" tidak mencukupi.
    💰 Saldo: Rp ${fromBalance.toLocaleString('id-ID')}
    💸 Dibutuhkan: Rp ${amount.toLocaleString('id-ID')}`);
                return;
            }

            // Process transfer (create two transactions)
            const currentDate = moment().format('DD/MM/YYYY');
            const currentTime = moment().format('HH:mm:ss');

            // Outgoing transaction
            const outTransaction = {
                date: currentDate,
                time: currentTime,
                type: 'Expense',
                amount: amount,
                description: `Transfer ke pocket ${toPocket}`,
                category: 'Transfer',
                pocket: fromPocket,
                source: 'WhatsApp Bot - Transfer'
            };

            // Incoming transaction
            const inTransaction = {
                date: currentDate,
                time: currentTime,
                type: 'Income',
                amount: amount,
                description: `Transfer dari pocket ${fromPocket}`,
                category: 'Transfer',
                pocket: toPocket,
                source: 'WhatsApp Bot - Transfer'
            };

            // Save both transactions
            await this.googleSheetsService.addTransaction(outTransaction);
            await this.googleSheetsService.addTransaction(inTransaction);

            // Get updated balances
            const newFromBalance = await this.googleSheetsService.getPocketBalance(fromPocket);
            const newToBalance = await this.googleSheetsService.getPocketBalance(toPocket);

            const confirmationMessage = `✅ Transfer berhasil!
    💸 Dari: ${fromPocket} → Rp ${newFromBalance.toLocaleString('id-ID')}
    💰 Ke: ${toPocket} → Rp ${newToBalance.toLocaleString('id-ID')}
    💵 Jumlah: Rp ${amount.toLocaleString('id-ID')}
    📅 Waktu: ${currentDate} ${currentTime}`;

            await message.reply(confirmationMessage);

        } catch (error) {
            console.error('Error processing pocket transfer:', error);
            await message.reply('Terjadi kesalahan saat transfer antar pocket.');
        }
    }

    private extractPocketName(text: string): string | null {
        const match = text.match(/pocket\s+(.+)$/i);
        return match ? match[1].trim() : null;
    }

    private parseTransferCommand(text: string): { amount: number; fromPocket: string; toPocket: string } | null {
        const regex = /transfer\s+(\S+)\s+dari\s+pocket\s+(.+?)\s+ke\s+pocket\s+(.+)$/i;
        const match = text.match(regex);

        if (!match) return null;

        const amount = this.parseAmount(match[1]);
        if (amount === null) return null;

        return {
            amount,
            fromPocket: match[2].trim(),
            toPocket: match[3].trim()
        };
    }

    private generateReport(transactions: any[], queryIntent: any): string {
        if (transactions.length === 0) {
            return `📊 Laporan ${queryIntent.period}\n\nTidak ada transaksi ditemukan untuk periode ini.`;
        }

        const income = transactions.filter(t => t.type === 'Income');
        const expense = transactions.filter(t => t.type === 'Expense');

        const totalIncome = income.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const totalExpense = expense.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const balance = totalIncome - totalExpense;

        let report = `📊 Laporan ${queryIntent.period}\n`;
        report += `📅 Periode: ${queryIntent.startDate} - ${queryIntent.endDate}\n\n`;

        // Summary
        report += `💰 RINGKASAN:\n`;
        report += `📈 Total Pemasukan: Rp ${totalIncome.toLocaleString('id-ID')}\n`;
        report += `📉 Total Pengeluaran: Rp ${totalExpense.toLocaleString('id-ID')}\n`;
        report += `💳 Saldo: Rp ${balance.toLocaleString('id-ID')} ${balance >= 0 ? '✅' : '❌'}\n\n`;

        // Top categories for expenses
        if (expense.length > 0) {
            const expenseByCategory = this.groupByCategory(expense);
            const topExpenses = Object.entries(expenseByCategory)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5);

            report += `📉 TOP PENGELUARAN:\n`;
            topExpenses.forEach(([category, amount]) => {
                report += `• ${category}: Rp ${amount.toLocaleString('id-ID')}\n`;
            });
        }

        // Income categories if any
        if (income.length > 0) {
            const incomeByCategory = this.groupByCategory(income);
            report += `\n📈 PEMASUKAN:\n`;
            Object.entries(incomeByCategory).forEach(([category, amount]) => {
                report += `• ${category}: Rp ${amount.toLocaleString('id-ID')}\n`;
            });
        }

        report += `\n📊 Total Transaksi: ${transactions.length}`;
        return report;
    }

    private groupByCategory(transactions: any[]): { [key: string]: number } {
        return transactions.reduce((acc, transaction) => {
            const category = transaction.category || 'Lainnya';
            acc[category] = (acc[category] || 0) + parseFloat(transaction.amount || 0);
            return acc;
        }, {});
    }

    private async sendHelpMessage(message: Message) {
        const helpText = `🤖 WhatsApp Finance Bot - Bantuan
    
    📝 MENCATAT TRANSAKSI:
    • /pemasukan [jumlah] [deskripsi] ke pocket [nama]
      Contoh: /pemasukan 500rb gaji bulanan ke pocket utama
    
    • /pengeluaran [jumlah] [deskripsi] dari pocket [nama]  
      Contoh: /pengeluaran 25rb makan siang dari pocket harian
    
    💰 FORMAT JUMLAH:
    • 10rb = 10.000 • 100k = 100.000 • 1jt = 1.000.000
    
    👝 POCKET MANAGEMENT:
    • "Saldo pocket [nama]" - Lihat saldo pocket tertentu
    • "Saldo pocket" - Lihat semua pocket
    • "List pocket" - Daftar semua pocket
    • "Transfer 100rb dari pocket utama ke pocket harian"
    
    📊 MELIHAT LAPORAN:
    • "Berapa pengeluaran minggu ini?"
    • "Total pemasukan bulan ini"
    • "Laporan keuangan tahun ini"
    • "Pengeluaran hari ini"
    
    💡 TIPS POCKET:
    • Pocket otomatis dibuat saat transaksi pertama
    • Contoh nama pocket: utama, harian, bulanan, darurat
    • Bot akan cek saldo pocket sebelum pengeluaran
    • Transfer antar pocket untuk mengatur uang
    
    Ketik /help untuk melihat pesan ini lagi.`;

        await message.reply(helpText);
    }

    private async processFinanceMessage(message: Message) {
        try {
            const body = message.body.trim();
            const parts = body.split(' ');

            if (parts.length < 3) {
                await message.reply(`Format tidak valid. Gunakan:
    📥 /pemasukan [jumlah] [deskripsi] ke pocket [nama_pocket]
    📤 /pengeluaran [jumlah] [deskripsi] dari pocket [nama_pocket]
    
    Contoh:
    • /pemasukan 500rb gaji bulanan ke pocket utama
    • /pengeluaran 25rb makan siang dari pocket harian`);
                return;
            }

            const type = parts[0].replace('/', ''); // pemasukan or pengeluaran
            const amountStr = parts[1];

            // Parse pocket information
            const bodyLower = body.toLowerCase();
            let pocket = 'default';
            let description = '';

            if (type === 'pemasukan' && bodyLower.includes(' ke pocket ')) {
                const splitByPocket = body.split(/ ke pocket /i);
                if (splitByPocket.length === 2) {
                    description = splitByPocket[0].split(' ').slice(2).join(' ');
                    pocket = splitByPocket[1].trim();
                }
            } else if (type === 'pengeluaran' && bodyLower.includes(' dari pocket ')) {
                const splitByPocket = body.split(/ dari pocket /i);
                if (splitByPocket.length === 2) {
                    description = splitByPocket[0].split(' ').slice(2).join(' ');
                    pocket = splitByPocket[1].trim();
                }
            } else {
                description = parts.slice(2).join(' ');
                pocket = 'default';
            }

            // Parse amount (handle formats like 10rb, 100k, etc.)
            const amount = this.parseAmount(amountStr);

            if (amount === null) {
                await message.reply('Format jumlah tidak valid. Contoh: 10rb, 100k, 50000');
                return;
            }

            // Check pocket balance for expenses
            if (type === 'pengeluaran') {
                const pocketBalance = await this.googleSheetsService.getPocketBalance(pocket);
                if (pocketBalance < amount) {
                    await message.reply(`❌ Saldo pocket "${pocket}" tidak mencukupi!
    💰 Saldo saat ini: Rp ${pocketBalance.toLocaleString('id-ID')}
    💸 Yang dibutuhkan: Rp ${amount.toLocaleString('id-ID')}
    📊 Ketik "saldo pocket ${pocket}" untuk melihat detail`);
                    return;
                }
            }

            // Get category from OpenAI
            const category = await this.openaiService.categorizeTransaction(description, type);

            // Prepare data for Google Sheets
            const transactionData = {
                date: moment().format('DD/MM/YYYY'),
                time: moment().format('HH:mm:ss'),
                type: type === 'pemasukan' ? 'Income' : 'Expense',
                amount: amount,
                description: description,
                category: category,
                pocket: pocket,
                source: 'WhatsApp Bot'
            };

            // Save to Google Sheets
            await this.googleSheetsService.addTransaction(transactionData);

            // Get updated pocket balance
            const newBalance = await this.googleSheetsService.getPocketBalance(pocket);

            // Send confirmation
            const confirmationMessage = `✅ Transaksi berhasil dicatat!
    📅 Tanggal: ${transactionData.date} ${transactionData.time}
    💰 Jenis: ${transactionData.type}
    💵 Jumlah: Rp ${amount.toLocaleString('id-ID')}
    📝 Deskripsi: ${description}
    🏷️ Kategori: ${category}
    👝 Pocket: ${pocket}
    💳 Saldo pocket "${pocket}": Rp ${newBalance.toLocaleString('id-ID')}`;

            await message.reply(confirmationMessage);

        } catch (error) {
            console.error('Error processing finance message:', error);
            await message.reply('Terjadi kesalahan saat memproses transaksi. Silakan coba lagi.');
        }
    }
    private parseAmount(amountStr: string): number | null {
        const cleanStr = amountStr.toLowerCase();

        // Handle 'rb' suffix (ribu/thousand) with decimal support
        if (cleanStr.includes('rb') || cleanStr.includes('ribu')) {
            // Replace comma with dot for decimal parsing, then remove 'rb' or 'ribu'
            const numberStr = cleanStr.replace(',', '.').replace(/rb|ribu/g, '');
            const number = parseFloat(numberStr);
            return isNaN(number) ? null : number * 1000;
        }

        // Handle 'k' suffix (thousand) with decimal support
        if (cleanStr.includes('k')) {
            const numberStr = cleanStr.replace(',', '.').replace('k', '');
            const number = parseFloat(numberStr);
            return isNaN(number) ? null : number * 1000;
        }

        // Handle 'jt' or 'juta' suffix (million) with decimal support
        if (cleanStr.includes('jt') || cleanStr.includes('juta')) {
            const numberStr = cleanStr.replace(',', '.').replace(/jt|juta/g, '');
            const number = parseFloat(numberStr);
            return isNaN(number) ? null : number * 1000000;
        }

        // Handle regular numbers with decimal support
        const numberStr = cleanStr.replace(',', '.');
        const number = parseFloat(numberStr);
        return isNaN(number) ? null : number;
    }

    // private parseAmount(amountStr: string): number | null {
    //     const cleanStr = amountStr.toLowerCase().replace(/[.,]/g, '');

    //     // Handle 'rb' suffix (ribu/thousand)
    //     if (cleanStr.includes('rb') || cleanStr.includes('ribu')) {
    //         const number = parseFloat(cleanStr.replace(/[^0-9]/g, ''));
    //         return isNaN(number) ? null : number * 1000;
    //     }

    //     // Handle 'k' suffix (thousand)
    //     if (cleanStr.includes('k')) {
    //         const number = parseFloat(cleanStr.replace(/[^0-9]/g, ''));
    //         return isNaN(number) ? null : number * 1000;
    //     }

    //     // Handle 'jt' or 'juta' suffix (million)
    //     if (cleanStr.includes('jt') || cleanStr.includes('juta')) {
    //         const number = parseFloat(cleanStr.replace(/[^0-9]/g, ''));
    //         return isNaN(number) ? null : number * 1000000;
    //     }

    //     // Handle regular numbers
    //     const number = parseFloat(cleanStr.replace(/[^0-9]/g, ''));
    //     return isNaN(number) ? null : number;
    // }
}