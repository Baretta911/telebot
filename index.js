require('dotenv').config();

// Bot Telegram dengan fitur produk & transaksi
// Install dependencies: node-telegram-bot-api, lowdb, pdfkit

const TelegramBot = require('node-telegram-bot-api');
const PDFDocument = require('pdfkit');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const fs = require('fs');

// Ganti dengan token bot Anda
const TOKEN = process.env.BOT_TOKEN || 'REPLACE_WITH_TOKEN';
let bot;
try {
  bot = new TelegramBot(TOKEN, { polling: true });
} catch (err) {
  console.error('Gagal inisialisasi bot:', err);
  process.exit(1);
}

// Setup database
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { products: [], transactions: [] });
async function initDB() {
  try {
    await db.read();
    db.data ||= { products: [], transactions: [] };
    await db.write();
  } catch (err) {
    console.error('Gagal inisialisasi database:', err);
    process.exit(1);
  }
}
initDB();

// Menu utama
const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '📦 Tambah Produk', callback_data: 'add_product' },
        { text: '🗑️ Hapus Produk', callback_data: 'delete_product' }
      ],
      [
        { text: '🛒 Tambah Transaksi', callback_data: 'add_transaction' },
        { text: '❌ Hapus Transaksi', callback_data: 'delete_transaction' }
      ],
      [
        { text: '📋 Lihat Produk', callback_data: 'view_products' },
        { text: '📊 Lihat Transaksi', callback_data: 'view_transactions' }
      ],
      [{ text: '📄 Download PDF Transaksi', callback_data: 'print_transactions' }],
      [{ text: '⚙️ Bantuan', callback_data: 'help' }]
    ],
  },
};

bot.onText(/\/start/, async (msg) => {
  try {
    const welcomeMsg = `🎉 *Selamat datang di Bot Toko!* 🎉\n\n🛍️ Kelola produk dan transaksi dengan mudah\n💼 Fitur lengkap untuk bisnis Anda\n\nPilih menu di bawah untuk memulai:`;
    await bot.sendMessage(msg.chat.id, welcomeMsg, { parse_mode: 'Markdown', ...mainMenu });
  } catch (err) {
    console.error('Error /start:', err);
  }
});

// State untuk input
const userState = {};
let botActive = true;

// Cleanup userState yang idle lebih dari 30 menit
setInterval(() => {
  const now = Date.now();
  for (const chatId in userState) {
    if (userState[chatId]?.lastActive && now - userState[chatId].lastActive > 30 * 60 * 1000) {
      delete userState[chatId];
    }
  }
}, 10 * 60 * 1000); // cek tiap 10 menit

// Command untuk menghapus produk
bot.onText(/\/delete_product/, async (msg) => {
  try {
    if (!botActive) return;
    await db.read();
    const chatId = msg.chat.id;
    if (db.data.products.length === 0) {
      bot.sendMessage(chatId, 'Tidak ada produk untuk dihapus.', mainMenu);
      return;
    }
    const buttons = db.data.products.map((p, i) => [{ text: p.name, callback_data: 'delprod_' + i }]);
    bot.sendMessage(chatId, 'Pilih produk yang akan dihapus:', { reply_markup: { inline_keyboard: buttons } });
  } catch (err) {
    console.error('Error /delete_product:', err);
    bot.sendMessage(msg.chat.id, '❌ Terjadi kesalahan saat menghapus produk.');
  }
});

// Command untuk menghapus transaksi
bot.onText(/\/delete_transaction/, async (msg) => {
  try {
    if (!botActive) return;
    await db.read();
    const chatId = msg.chat.id;
    if (db.data.transactions.length === 0) {
      bot.sendMessage(chatId, 'Tidak ada transaksi untuk dihapus.', mainMenu);
      return;
    }
    const buttons = db.data.transactions.map((t, i) => [{ text: `Transaksi #${i + 1}`, callback_data: 'deltrans_' + i }]);
    bot.sendMessage(chatId, 'Pilih transaksi yang akan dihapus:', { reply_markup: { inline_keyboard: buttons } });
  } catch (err) {
    console.error('Error /delete_transaction:', err);
    bot.sendMessage(msg.chat.id, '❌ Terjadi kesalahan saat menghapus transaksi.');
  }
});

bot.onText(/\/stop/, (msg) => {
  try {
    botActive = false;
    bot.sendMessage(msg.chat.id, 'Bot telah dihentikan. Untuk mengaktifkan kembali, restart aplikasi.');
  } catch (err) {
    console.error('Error /stop:', err);
  }
});

// Helper sanitasi Markdown
function safeMarkdown(txt='') {
  return String(txt).replace(/([_*\[\]()~`>#+=|{}.!-])/g,'\\$1');
}

// ==== Helper Generate Nota PDF (58mm thermal printer) ====
function generateNotaPDF(t, idx) {
  return new Promise((resolve, reject) => {
    // 58mm = ~164 pts, dengan margin kecil
    const doc = new PDFDocument({ 
      size: [164, 600], // lebar 58mm, tinggi auto
      margin: 8 
    });
    const filePath = `nota_lala_${idx+1}.pdf`;
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    
    // Header
    doc.fontSize(12).text('LALA SNACK', { align: 'center' });
    doc.fontSize(7).text('MELAYANI PEMESANAN', { align: 'center' });
    doc.fontSize(6).text('Jin M.yusup A3 Jetis Rt 01/rw 14', { align: 'center' });
    doc.fontSize(6).text('Growong Pucungrejo Muntilan', { align: 'center' });
    doc.fontSize(6).text('Magelang - 081568279340', { align: 'center' });
    doc.fontSize(6).text('================================', { align: 'center' });
    
    // Info transaksi
    doc.fontSize(7).text(`Kepada: ${t.buyer || '-'}`);
    doc.fontSize(7).text(`No: TRX-${String(idx + 1).padStart(4,'0')}`);
    doc.fontSize(7).text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`);
    doc.fontSize(6).text('--------------------------------', { align: 'center' });
    
    // Items
    const items = (t.items && Array.isArray(t.items) && t.items.length) ? t.items : [{ qty: t.qty || 1, name: t.product || '-', price: t.price || 0, subtotal: t.total || t.price || 0 }];
    items.forEach((it, i) => {
      doc.fontSize(7).text(`${it.name}`);
      doc.fontSize(6).text(`  ${it.qty} x ${it.price.toLocaleString('id-ID')} = ${it.subtotal.toLocaleString('id-ID')}`);
    });
    
    doc.fontSize(6).text('--------------------------------', { align: 'center' });
    
    // Total
    const total = (t.total != null) ? t.total : items.reduce((a,b)=>a+(b.subtotal||0),0);
    doc.fontSize(8).text(`TOTAL: Rp ${total.toLocaleString('id-ID')}`, { align: 'center' });
    doc.fontSize(6).text('================================', { align: 'center' });
    
    // Footer
    doc.fontSize(5).text('Barang 1 minggu tidak diambil');
    doc.fontSize(5).text('rusak/hilang bukan tanggung jawab kami');
    doc.fontSize(6).text('Melayani Antar Jemput');
    doc.fontSize(6).text('Hormat Kami,', { align: 'center' });
    
    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

bot.on('callback_query', async (query) => {
  try {
    const chatId = query.message?.chat?.id;
    const data = query.data;
    if (!chatId || !botActive) return;
    if (userState[chatId]) userState[chatId].lastActive = Date.now();
    await db.read();
    // === Cetak nota (print_trans_) ===
    if (data.startsWith('print_trans_')) {
      const idx = parseInt(data.split('_')[2]);
      const t = db.data.transactions[idx];
      if (!t) return bot.sendMessage(chatId,'❌ Transaksi tidak ditemukan.');
      let phId=null; try { const ph= await bot.sendMessage(chatId,`🖨️ Membuat nota transaksi #${idx+1} (PDF) ...`); phId=ph.message_id; } catch{}
      try {
        const filePath = await generateNotaPDF(t, idx);
        await bot.sendDocument(chatId, filePath, { caption:`✅ Nota Transaksi #${idx+1}\nTotal: Rp${(t.total||0).toLocaleString('id-ID')}` });
        fs.unlinkSync(filePath); // hapus file setelah dikirim
      } catch(e){ console.error('Render nota gagal:',e); await bot.sendMessage(chatId,'❌ Gagal membuat nota PDF.'); }
      finally { if (phId) { try { await bot.deleteMessage(chatId,phId);} catch{} } }
      return;
    }
    // === Kirim ulang nota (resend) ===
    if (data.startsWith('resend_pdf_trans_')) {
      const idx = parseInt(data.split('_')[3]);
      const t = db.data.transactions[idx];
      if (!t) return bot.sendMessage(chatId,'❌ Transaksi tidak ditemukan.');
      let phId=null; try { const ph= await bot.sendMessage(chatId,`🔄 Membuat ulang nota #${idx+1} (PDF) ...`); phId=ph.message_id; } catch{}
      try {
        const filePath = await generateNotaPDF(t, idx);
        await bot.sendDocument(chatId, filePath, { caption:`🖼️ Nota LALA SNACK #${idx+1}` });
        fs.unlinkSync(filePath);
      } catch(e){ console.error('Render nota gagal:',e); await bot.sendMessage(chatId,'❌ Gagal membuat nota PDF.'); }
      finally { if (phId) { try { await bot.deleteMessage(chatId,phId);} catch{} } }
      return;
    }
    // === Pilih transaksi (daftar) ===
    if (data === 'print_transactions') {
      if (db.data.transactions.length === 0) return bot.sendMessage(chatId,'📄 *Tidak ada transaksi untuk dicetak*',{ parse_mode:'Markdown', ...mainMenu });
      const buttons = db.data.transactions.map((t,i)=>[{ text:`📄 Cetak Transaksi #${i+1}`, callback_data:`print_trans_${i}`},{ text:'🔄 Kirim Ulang Nota', callback_data:`resend_pdf_trans_${i}` }]);
      buttons.push([{ text:'🔙 Kembali ke Menu', callback_data:'back_to_menu'}]);
      const list = db.data.transactions.map((t,i)=> t.items? `${i+1}. *${t.items.map(it=>`${it.name} x${it.qty}`).join(', ')}*\n   💰 Total: Rp${t.total.toLocaleString('id-ID')} | 👤 ${t.buyer}` : `${i+1}. *${t.product} x${t.qty}*\n   👤 ${t.buyer}`).join('\n\n');
      bot.sendMessage(chatId,`📄 *Cetak / Kirim Ulang Nota*\n\n${list}`,{ parse_mode:'Markdown', reply_markup: { inline_keyboard: buttons }});
      return;
    }
    // === Produk ===
    if (data === 'add_product') { userState[chatId]={ action:'add_product', step:1, temp:{} }; return bot.sendMessage(chatId,'📦 *Tambah Produk Baru*\n\nMasukkan nama produk:',{ parse_mode:'Markdown' }); }
    if (data === 'delete_product') {
      if (db.data.products.length===0) return bot.sendMessage(chatId,'❌ *Tidak ada produk untuk dihapus.*',{ parse_mode:'Markdown', ...mainMenu });
      const buttons = db.data.products.map((p,i)=>[{ text:`🗑️ ${p.name} - Rp${p.price}`, callback_data:'delprod_'+i }]);
      buttons.push([{ text:'🔙 Kembali ke Menu', callback_data:'back_to_menu'}]);
      return bot.sendMessage(chatId,'🗑️ *Hapus Produk*\n\nPilih produk:',{ parse_mode:'Markdown', reply_markup:{ inline_keyboard: buttons }});
    }
    if (data.startsWith('delprod_')) { const idx=parseInt(data.split('_')[1]); const prod=db.data.products[idx]; db.data.products.splice(idx,1); await db.write(); return bot.sendMessage(chatId,`✅ *Produk Dihapus*\n\n${prod.name}`,{ parse_mode:'Markdown', ...mainMenu }); }
    // === Transaksi ===
    if (data === 'delete_transaction') {
      if (db.data.transactions.length===0) return bot.sendMessage(chatId,'❌ *Tidak ada transaksi untuk dihapus.*',{ parse_mode:'Markdown', ...mainMenu });
      const buttons = db.data.transactions.map((t,i)=>[{ text:`🗑️ Transaksi #${i+1}`, callback_data:'deltrans_'+i }]);
      buttons.push([{ text:'🔙 Kembali ke Menu', callback_data:'back_to_menu'}]);
      return bot.sendMessage(chatId,'🗑️ *Hapus Transaksi*\n\nPilih transaksi:',{ parse_mode:'Markdown', reply_markup:{ inline_keyboard: buttons }});
    }
    if (data.startsWith('deltrans_')) { const idx=parseInt(data.split('_')[1]); db.data.transactions.splice(idx,1); await db.write(); return bot.sendMessage(chatId,`✅ *Transaksi Dihapus* #${idx+1}`,{ parse_mode:'Markdown', ...mainMenu }); }
    if (data === 'add_transaction') {
      if (db.data.products.length===0) return bot.sendMessage(chatId,'❌ *Tidak ada produk tersedia*',{ parse_mode:'Markdown', ...mainMenu });
      userState[chatId]={ action:'add_transaction', step:0, transaction:{ items:[] } };
      const buttons = db.data.products.map((p,i)=>[{ text:`🛒 ${p.name} - Rp${p.price.toLocaleString('id-ID')}`, callback_data:'chooseprod_'+i }]);
      buttons.push([{ text:'🔙 Kembali ke Menu', callback_data:'back_to_menu'}]);
      return bot.sendMessage(chatId,'🛒 *Tambah Transaksi Baru*\n\nPilih produk:',{ parse_mode:'Markdown', reply_markup:{ inline_keyboard: buttons }});
    }
    if (data.startsWith('chooseprod_')) { 
      const idx=parseInt(data.split('_')[1]); 
      const prod=db.data.products[idx]; 
      if(!prod) return bot.sendMessage(chatId,'❌ Produk tidak ditemukan.');
      if(!userState[chatId] || userState[chatId].action!=='add_transaction') { userState[chatId]={ action:'add_transaction', step:0, transaction:{ items:[] } }; }
      userState[chatId].step=1; 
      userState[chatId].selectedProduct={ idx, name:prod.name, price:prod.price }; 
      return bot.sendMessage(chatId,`🔢 *Input Jumlah*\n\n${safeMarkdown(prod.name)} (Rp${prod.price.toLocaleString('id-ID')}/pcs)`,{ parse_mode:'Markdown' }); 
    }
    if (data === 'add_more_product') { userState[chatId].step=0; const buttons=db.data.products.map((p,i)=>[{ text:`🛒 ${p.name} - Rp${p.price.toLocaleString('id-ID')}`, callback_data:'chooseprod_'+i }]); buttons.push([{ text:'✅ Selesai & Checkout', callback_data:'checkout_transaction'}]); return bot.sendMessage(chatId,'🛒 *Tambah Produk Lagi*',{ parse_mode:'Markdown', reply_markup:{ inline_keyboard: buttons }}); }
    if (data === 'checkout_transaction') { if(!userState[chatId]) return bot.sendMessage(chatId,'❌ Transaksi tidak valid',{ parse_mode:'Markdown', ...mainMenu }); userState[chatId].step=2; return bot.sendMessage(chatId,'👤 *Data Pembeli*\n\nMasukkan nama pembeli:',{ parse_mode:'Markdown' }); }
    // === Kurangi produk dalam transaksi aktif ===
    if (data === 'remove_product_menu') { const state=userState[chatId]; if(!state||!state.transaction.items.length) return bot.sendMessage(chatId,'❌ Tidak ada produk yang bisa dikurangi.',{ parse_mode:'Markdown' }); const buttons=state.transaction.items.map((it,i)=>[{ text:`➖ ${it.name} x${it.qty}`, callback_data:'remove_product_'+i }]); buttons.push([{ text:'🔙 Kembali', callback_data:'back_to_summary'}]); return bot.sendMessage(chatId,'Pilih produk yang dihapus:',{ reply_markup:{ inline_keyboard: buttons }}); }
    if (data.startsWith('remove_product_')) { const idx=parseInt(data.split('_')[2]); const state=userState[chatId]; if(!state||!state.transaction.items[idx]) return bot.sendMessage(chatId,'❌ Produk tidak ditemukan.',{ parse_mode:'Markdown' }); state.transaction.items.splice(idx,1); const summary=state.transaction.items.map((it,i)=>`${i+1}. *${it.name}* x${it.qty} = Rp${it.subtotal.toLocaleString('id-ID')}`).join('\n')||'-'; const total=state.transaction.items.reduce((a,b)=>a+b.subtotal,0); const buttons=[[{ text:'➕ Tambah Produk', callback_data:'add_more_product'}],[{ text:'➖ Kurangi Produk', callback_data:'remove_product_menu'}],[{ text:'✅ Checkout Sekarang', callback_data:'checkout_transaction'}]]; return bot.sendMessage(chatId,`📋 *Ringkasan Transaksi:*\n${summary}\n\n💰 *Subtotal: Rp${total.toLocaleString('id-ID')}*`,{ parse_mode:'Markdown', reply_markup:{ inline_keyboard: buttons }}); }
    if (data === 'back_to_summary') { const state=userState[chatId]; if(!state) return; const summary=state.transaction.items.map((it,i)=>`${i+1}. *${it.name}* x${it.qty} = Rp${it.subtotal.toLocaleString('id-ID')}`).join('\n'); const total=state.transaction.items.reduce((a,b)=>a+b.subtotal,0); const buttons=[[{ text:'➕ Tambah Produk', callback_data:'add_more_product'}],[{ text:'➖ Kurangi Produk', callback_data:'remove_product_menu'}],[{ text:'✅ Checkout Sekarang', callback_data:'checkout_transaction'}]]; return bot.sendMessage(chatId,`📋 *Ringkasan Transaksi:*\n${summary}\n\n💰 *Subtotal: Rp${total.toLocaleString('id-ID')}*`,{ parse_mode:'Markdown', reply_markup:{ inline_keyboard: buttons }}); }
    // === Lihat produk / transaksi / bantuan / kembali ===
    if (data === 'view_products') { const products=db.data.products; if(!products.length) return bot.sendMessage(chatId,'📦 *Daftar Produk Kosong*',{ parse_mode:'Markdown', ...mainMenu }); const list=products.map((p,i)=>`${i+1}. *${p.name}* - Rp${p.price.toLocaleString('id-ID')}`).join('\n'); return bot.sendMessage(chatId,`📦 *Daftar Produk* (${products.length})\n\n${list}`,{ parse_mode:'Markdown', ...mainMenu }); }
    if (data === 'view_transactions') { const trans=db.data.transactions; if(!trans.length) return bot.sendMessage(chatId,'📊 *Daftar Transaksi Kosong*',{ parse_mode:'Markdown', ...mainMenu }); const list=trans.map((t,i)=> t.items? `${i+1}. *${t.items.map(it=>`${it.name} x${it.qty}`).join(', ')}*\n   💰 Total: Rp${t.total.toLocaleString('id-ID')} | 👤 ${t.buyer}` : `${i+1}. *${t.product} x${t.qty}*\n   👤 ${t.buyer}`).join('\n\n'); return bot.sendMessage(chatId,`📊 *Daftar Transaksi* (${trans.length})\n\n${list}`,{ parse_mode:'Markdown', ...mainMenu }); }
    if (data === 'help') { const helpMsg=`📚 *Panduan Penggunaan Bot Toko*\n\n• Tambah / Hapus Produk\n• Tambah / Hapus Transaksi\n• Cetak / Kirim Ulang Nota (PDF)\n• Lihat Produk & Transaksi`; return bot.sendMessage(chatId,helpMsg,{ parse_mode:'Markdown', ...mainMenu }); }
    if (data === 'back_to_menu') { delete userState[chatId]; return bot.sendMessage(chatId,'🏠 *Menu Utama*',{ parse_mode:'Markdown', ...mainMenu }); }
  } catch (err) {
    console.error('Callback error:', err);
    try { await bot.sendMessage(query.message?.chat?.id || query.from?.id, '❌ Terjadi kesalahan memproses.'); } catch(e){}
  }
});

bot.on('message', async (msg) => {
  try {
    if (!botActive) return;
    const chatId = msg.chat.id;
    if (!userState[chatId]) return;
    userState[chatId].lastActive = Date.now();
    await db.read();
    const state = userState[chatId];

    // Handler tambah produk
    if (state.action === 'add_product') {
      if (state.step === 1) {
        state.temp.name = msg.text;
        userState[chatId].step = 2;
        bot.sendMessage(chatId, '💰 *Input Harga Produk*\n\nMasukkan harga produk (angka saja):', { parse_mode: 'Markdown' });
      } else if (state.step === 2) {
        const price = parseInt(msg.text);
        if (isNaN(price) || price < 0) {
          bot.sendMessage(chatId, '❌ *Harga tidak valid*\n\nMasukkan angka positif untuk harga produk.', { parse_mode: 'Markdown' });
          return;
        }
        state.temp.price = price;
        db.data.products.push({ name: state.temp.name, price: state.temp.price });
        await db.write();
        bot.sendMessage(chatId, `✅ *Produk Berhasil Ditambahkan*\n\n📦 Produk: ${safeMarkdown(state.temp.name)}\n💰 Harga: Rp${state.temp.price.toLocaleString('id-ID')}`, { parse_mode: 'Markdown', ...mainMenu });
        delete userState[chatId];
      }
      return;
    }

    // Handler tambah transaksi
    if (state.action === 'add_transaction') {
      if (state.step === 1) {
        const qty = parseInt(msg.text);
        if (isNaN(qty) || qty <= 0) {
          bot.sendMessage(chatId, '❌ *Jumlah tidak valid*\n\nMasukkan angka positif untuk jumlah produk.', { parse_mode: 'Markdown' });
          return;
        }
        const prod = userState[chatId].selectedProduct;
        if(!prod) {
          state.step = 0;
          return bot.sendMessage(chatId,'⚠️ Produk tidak tersedia, pilih ulang.',{ parse_mode:'Markdown' });
        }
        state.transaction.items.push({ name: prod.name, price: prod.price, qty, subtotal: prod.price * qty });
        delete userState[chatId].selectedProduct;
        // Tampilkan ringkasan transaksi dengan tombol tambah, kurangi, checkout
        let summary = state.transaction.items.map((item, i) => `${i + 1}. *${safeMarkdown(item.name)}* x${item.qty} = Rp${item.subtotal.toLocaleString('id-ID')}`).join('\n');
        let total = state.transaction.items.reduce((a, b) => a + b.subtotal, 0);
        const buttons = [
          [{ text: '➕ Tambah Produk', callback_data: 'add_more_product' }],
          [{ text: '➖ Kurangi Produk', callback_data: 'remove_product_menu' }],
          [{ text: '✅ Checkout Sekarang', callback_data: 'checkout_transaction' }]
        ];
        bot.sendMessage(chatId, `📋 *Ringkasan Transaksi:*\n${summary}\n\n💰 *Subtotal: Rp${total.toLocaleString('id-ID')}*\n\nPilih aksi berikut:`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        });
      } else if (state.step === 2) {
        state.transaction.buyer = msg.text;
        state.transaction.total = state.transaction.items.reduce((a, b) => a + b.subtotal, 0);
        state.transaction.timestamp = new Date().toISOString();
        db.data.transactions.push(state.transaction);
        await db.write();
        
        let summary = state.transaction.items.map((item, i) => `${i + 1}. *${safeMarkdown(item.name)}* x${item.qty} (Rp${item.price.toLocaleString('id-ID')}/pcs) = Rp${item.subtotal.toLocaleString('id-ID')}`).join('\n');
        bot.sendMessage(chatId, `🎉 *Transaksi Berhasil!*\n\n📋 *Detail Transaksi:*\n${summary}\n\n💰 *Total: Rp${state.transaction.total.toLocaleString('id-ID')}*\n👤 *Pembeli: ${safeMarkdown(state.transaction.buyer)}*\n📅 *Tanggal: ${new Date().toLocaleDateString('id-ID')}*`, { parse_mode: 'Markdown', ...mainMenu });
        delete userState[chatId];
      }
      return;
    }
  } catch (err) {
    console.error('Error on message:', err);
    try { await bot.sendMessage(msg.chat.id, '❌ Terjadi kesalahan memproses pesan Anda.'); } catch(e){}
  }
});

// Handler error global untuk mencegah crash
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Bot stopping...');
  botActive = false;
  setTimeout(() => process.exit(0), 1000);
});

console.log('🚀 Bot sudah aktif dan siap digunakan!');