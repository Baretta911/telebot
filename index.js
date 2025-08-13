// Bot Telegram dengan fitur produk & transaksi
// Install dependencies: node-telegram-bot-api, lowdb, pdfkit, node-html-to-image

const TelegramBot = require('node-telegram-bot-api');
const PDFDocument = require('pdfkit');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const fs = require('fs');
const nodeHtmlToImage = require('node-html-to-image');

require('dotenv').config?.(); // aman jika dotenv tidak terpasang
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('BOT_TOKEN belum diset. Tambahkan ke file .env');
  process.exit(1);
}
const bot = new TelegramBot(TOKEN, { polling: true });

// Setup database
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { products: [], transactions: [] });
async function initDB() {
  await db.read();
  db.data ||= { products: [], transactions: [] };
  await db.write();
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

bot.onText(/\/start/, (msg) => {
  const welcomeMsg = `🎉 *Selamat datang di Bot Toko!* 🎉

🛍️ Kelola produk dan transaksi dengan mudah
💼 Fitur lengkap untuk bisnis Anda

Pilih menu di bawah untuk memulai:`;
  bot.sendMessage(msg.chat.id, welcomeMsg, { parse_mode: 'Markdown', ...mainMenu });
});

// State untuk input
const userState = {};
let botActive = true;
// Command untuk menghapus produk
bot.onText(/\/delete_product/, async (msg) => {
  if (!botActive) return;
  await db.read();
  const chatId = msg.chat.id;
  if (db.data.products.length === 0) {
    bot.sendMessage(chatId, 'Tidak ada produk untuk dihapus.', mainMenu);
    return;
  }
  const buttons = db.data.products.map((p, i) => [{ text: p.name, callback_data: 'delprod_' + i }]);
  bot.sendMessage(chatId, 'Pilih produk yang akan dihapus:', { reply_markup: { inline_keyboard: buttons } });
});

// Command untuk menghapus transaksi
bot.onText(/\/delete_transaction/, async (msg) => {
  if (!botActive) return;
  await db.read();
  const chatId = msg.chat.id;
  if (db.data.transactions.length === 0) {
    bot.sendMessage(chatId, 'Tidak ada transaksi untuk dihapus.', mainMenu);
    return;
  }
  const buttons = db.data.transactions.map((t, i) => [{ text: `Transaksi #${i + 1}`, callback_data: 'deltrans_' + i }]);
  bot.sendMessage(chatId, 'Pilih transaksi yang akan dihapus:', { reply_markup: { inline_keyboard: buttons } });
});

bot.onText(/\/stop/, (msg) => {
  botActive = false;
  bot.sendMessage(msg.chat.id, 'Bot telah dihentikan. Untuk mengaktifkan kembali, restart aplikasi.');
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  await db.read();
  if (!botActive) return;
  bot.answerCallbackQuery(query.id);

  // === Handler Download PDF Transaksi ===
  if (data.startsWith('print_trans_')) {
    const idx = parseInt(data.split('_')[2]);
    const t = db.data.transactions[idx];
    if (!t) return bot.sendMessage(chatId, '❌ *Transaksi tidak ditemukan*\n\nTransaksi yang dipilih tidak ada dalam sistem.', { parse_mode: 'Markdown', ...mainMenu });
    // Generate HTML nota kecil LALA SNACK (rapi, mirip PDF)
    let itemsHtml = '';
    if (t.items && Array.isArray(t.items)) {
      itemsHtml = t.items.map((item, i) => `<tr><td style='text-align:center;border:1px solid #bdbdbd;'>${item.qty}</td><td style='border:1px solid #bdbdbd;'>${item.name}</td><td style='text-align:right;border:1px solid #bdbdbd;'>Rp${item.price.toLocaleString('id-ID')}</td><td style='text-align:right;border:1px solid #bdbdbd;'>Rp${item.subtotal.toLocaleString('id-ID')}</td></tr>`).join('');
    } else {
      itemsHtml = `<tr><td style='text-align:center;border:1px solid #bdbdbd;'>${t.qty}</td><td style='border:1px solid #bdbdbd;'>${t.product}</td><td style='text-align:right;border:1px solid #bdbdbd;'>-</td><td style='text-align:right;border:1px solid #bdbdbd;'>-</td></tr>`;
    }
    const html = `
    <div style='width:340px;min-height:420px;padding:10px 8px 8px 8px;font-family:sans-serif;background:#fff;border:1px solid #eee;'>
      <div style='font-size:22px;font-weight:bold;color:#1a237e;'>LALA SNACK</div>
      <div style='font-size:10px;color:#000;margin-bottom:2px;'>MELAYANI PEMESANAN</div>
      <div style='font-size:9px;color:#000;'>Alamat: Jin M.yusup A3 Jetis Rt 01/rw 14;<br>Growong Pucungrejo Muntilan Magelang<br>No Hp: 081568279340</div>
      <div style='margin:4px 0 2px 0;font-size:9px;color:#000;'>Kepada: <b>${t.buyer || '-'}</b> <span style='float:right;'>No: TRX-${String(idx + 1).padStart(4, '0')}</span></div>
      <hr style='border:1px solid #1a237e;margin:2px 0 4px 0;'>
      <table style='width:100%;font-size:9px;border-collapse:collapse;margin-bottom:4px;'>
        <tr style='color:#1a237e;font-weight:bold;background:#e3eafc;'>
          <td style='width:40px;text-align:center;border:1px solid #bdbdbd;'>Banyaknya</td>
          <td style='width:110px;border:1px solid #bdbdbd;'>Nama Barang</td>
          <td style='width:70px;text-align:right;border:1px solid #bdbdbd;'>Harga Barang</td>
          <td style='width:70px;text-align:right;border:1px solid #bdbdbd;'>Jumlah</td>
        </tr>
        ${itemsHtml}
      </table>
      <div style='border-top:1px solid #1a237e;margin:4px 0;'></div>
      <div style='font-size:11px;font-weight:bold;color:#1a237e;text-align:right;margin-bottom:2px;'>TOTAL Rp. <span style='font-size:12px;'>${(t.total || 0).toLocaleString('id-ID')}</span></div>
      <div style='font-size:8px;color:#000;margin-top:8px;'>Barang yang sudah 1 minggu tidak diambil rusak/hilang bukan tanggung jawab kami</div>
      <div style='font-size:9px;color:#1a237e;margin-top:8px;float:left;'>Melayani Antar Jemput</div>
      <div style='font-size:9px;color:#000;float:right;'>Hormat Kami,</div>
      <div style='clear:both;'></div>
    </div>
    `;
    const imgPath = `nota_lala_${idx + 1}.jpg`;
    await nodeHtmlToImage({ output: imgPath, html, type: 'jpeg', quality: 100 });
    if (fs.existsSync(imgPath)) {
      await bot.sendPhoto(chatId, imgPath, { caption: '🖼️ Nota LALA SNACK. File gambar dapat disimpan & dicetak.' });
      fs.unlinkSync(imgPath);
    } else {
      bot.sendMessage(chatId, '❌ *Gagal membuat gambar nota*', { parse_mode: 'Markdown', ...mainMenu });
    }
    return;
  }

  // === Handler Pilih Transaksi untuk Download PDF ===
  if (data === 'print_transactions') {
    if (db.data.transactions.length === 0) {
      bot.sendMessage(chatId, '📄 *Tidak ada transaksi untuk dicetak*\n\nBelum ada transaksi yang tersedia untuk dicetak PDF.', { parse_mode: 'Markdown', ...mainMenu });
      return;
    }
    const buttons = db.data.transactions.map((t, i) => [
      { text: `📄 Cetak Transaksi #${i + 1}`, callback_data: `print_trans_${i}` },
      { text: '🔄 Kirim Ulang PDF', callback_data: `resend_pdf_trans_${i}` }
    ]);
    buttons.push([{ text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }]);
    let list = db.data.transactions.map((t, i) => {
      if (t.items && Array.isArray(t.items)) {
        let items = t.items.map((item, idx) => `${item.name} x${item.qty}`).join(', ');
        return `${i + 1}. *${items}*\n   💰 Total: Rp${t.total.toLocaleString('id-ID')} | 👤 ${t.buyer}`;
      } else {
        return `${i + 1}. *${t.product} x${t.qty}*\n   👤 ${t.buyer}`;
      }
    }).join('\n\n');
    bot.sendMessage(chatId, `📄 *Cetak/Kirim Ulang PDF Transaksi*\n\nPilih transaksi yang ingin dicetak atau dikirim ulang:\n\n${list}`, { 
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons } 
    });
    return;
  }

  // === Handler Kirim Ulang JPG Nota ===
  if (data.startsWith('resend_pdf_trans_')) {
    const idx = parseInt(data.split('_')[3]);
    const t = db.data.transactions[idx];
    if (!t) return bot.sendMessage(chatId, '❌ *Transaksi tidak ditemukan*\n\nTransaksi yang dipilih tidak ada dalam sistem.', { parse_mode: 'Markdown', ...mainMenu });
    // Generate HTML nota kecil LALA SNACK (rapi, mirip PDF)
    let itemsHtml = '';
    if (t.items && Array.isArray(t.items)) {
      itemsHtml = t.items.map((item, i) => `<tr><td style='text-align:center;border:1px solid #bdbdbd;'>${item.qty}</td><td style='border:1px solid #bdbdbd;'>${item.name}</td><td style='text-align:right;border:1px solid #bdbdbd;'>Rp${item.price.toLocaleString('id-ID')}</td><td style='text-align:right;border:1px solid #bdbdbd;'>Rp${item.subtotal.toLocaleString('id-ID')}</td></tr>`).join('');
    } else {
      itemsHtml = `<tr><td style='text-align:center;border:1px solid #bdbdbd;'>${t.qty}</td><td style='border:1px solid #bdbdbd;'>${t.product}</td><td style='text-align:right;border:1px solid #bdbdbd;'>-</td><td style='text-align:right;border:1px solid #bdbdbd;'>-</td></tr>`;
    }
    const html = `
    <div style='width:340px;min-height:420px;padding:10px 8px 8px 8px;font-family:sans-serif;background:#fff;border:1px solid #eee;'>
      <div style='font-size:22px;font-weight:bold;color:#1a237e;'>LALA SNACK</div>
      <div style='font-size:10px;color:#000;margin-bottom:2px;'>MELAYANI PEMESANAN</div>
      <div style='font-size:9px;color:#000;'>Alamat: Jin M.yusup A3 Jetis Rt 01/rw 14;<br>Growong Pucungrejo Muntilan Magelang<br>No Hp: 081568279340</div>
      <div style='margin:4px 0 2px 0;font-size:9px;color:#000;'>Kepada: <b>${t.buyer || '-'}</b> <span style='float:right;'>No: TRX-${String(idx + 1).padStart(4, '0')}</span></div>
      <hr style='border:1px solid #1a237e;margin:2px 0 4px 0;'>
      <table style='width:100%;font-size:9px;border-collapse:collapse;margin-bottom:4px;'>
        <tr style='color:#1a237e;font-weight:bold;background:#e3eafc;'>
          <td style='width:40px;text-align:center;border:1px solid #bdbdbd;'>Banyaknya</td>
          <td style='width:110px;border:1px solid #bdbdbd;'>Nama Barang</td>
          <td style='width:70px;text-align:right;border:1px solid #bdbdbd;'>Harga Barang</td>
          <td style='width:70px;text-align:right;border:1px solid #bdbdbd;'>Jumlah</td>
        </tr>
        ${itemsHtml}
      </table>
      <div style='border-top:1px solid #1a237e;margin:4px 0;'></div>
      <div style='font-size:11px;font-weight:bold;color:#1a237e;text-align:right;margin-bottom:2px;'>TOTAL Rp. <span style='font-size:12px;'>${(t.total || 0).toLocaleString('id-ID')}</span></div>
      <div style='font-size:8px;color:#000;margin-top:8px;'>Barang yang sudah 1 minggu tidak diambil rusak/hilang bukan tanggung jawab kami</div>
      <div style='font-size:9px;color:#1a237e;margin-top:8px;float:left;'>Melayani Antar Jemput</div>
      <div style='font-size:9px;color:#000;float:right;'>Hormat Kami,</div>
      <div style='clear:both;'></div>
    </div>
    `;
    const imgPath = `nota_lala_${idx + 1}.jpg`;
    await nodeHtmlToImage({ output: imgPath, html, type: 'jpeg', quality: 100 });
    if (fs.existsSync(imgPath)) {
      await bot.sendPhoto(chatId, imgPath, { caption: '🖼️ Nota LALA SNACK. File gambar dapat disimpan & dicetak.' });
      fs.unlinkSync(imgPath);
    } else {
      bot.sendMessage(chatId, '❌ *Gagal membuat gambar nota*', { parse_mode: 'Markdown', ...mainMenu });
    }
    return;
  }

  // === Handler Tambah Produk ===
  if (data === 'add_product') {
    userState[chatId] = { action: 'add_product', step: 1, temp: {} };
    bot.sendMessage(chatId, '📦 *Tambah Produk Baru*\n\nMasukkan nama produk:', { parse_mode: 'Markdown' });
    return;
  }

  // === Handler Hapus Produk ===
  if (data === 'delete_product') {
    if (db.data.products.length === 0) {
      bot.sendMessage(chatId, '❌ *Tidak ada produk untuk dihapus.*\n\nTambahkan produk terlebih dahulu.', { parse_mode: 'Markdown', ...mainMenu });
      return;
    }
    const buttons = db.data.products.map((p, i) => [{ text: `🗑️ ${p.name} - Rp${p.price}`, callback_data: 'delprod_' + i }]);
    buttons.push([{ text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }]);
    bot.sendMessage(chatId, '🗑️ *Hapus Produk*\n\nPilih produk yang akan dihapus:', { 
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons } 
    });
    return;
  }
  if (data.startsWith('delprod_')) {
    const idx = parseInt(data.split('_')[1]);
    const prod = db.data.products[idx];
    db.data.products.splice(idx, 1);
    await db.write();
    bot.sendMessage(chatId, `✅ *Produk Dihapus*\n\nProduk "${prod.name}" berhasil dihapus dari sistem.`, { parse_mode: 'Markdown', ...mainMenu });
    return;
  }

  // === Handler Hapus Transaksi ===
  if (data === 'delete_transaction') {
    if (db.data.transactions.length === 0) {
      bot.sendMessage(chatId, '❌ *Tidak ada transaksi untuk dihapus.*\n\nBelum ada transaksi yang terdaftar.', { parse_mode: 'Markdown', ...mainMenu });
      return;
    }
    const buttons = db.data.transactions.map((t, i) => [{ text: `🗑️ Transaksi #${i + 1}`, callback_data: 'deltrans_' + i }]);
    buttons.push([{ text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }]);
    bot.sendMessage(chatId, '🗑️ *Hapus Transaksi*\n\nPilih transaksi yang akan dihapus:', { 
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons } 
    });
    return;
  }
  if (data.startsWith('deltrans_')) {
    const idx = parseInt(data.split('_')[1]);
    db.data.transactions.splice(idx, 1);
    await db.write();
    bot.sendMessage(chatId, `✅ *Transaksi Dihapus*\n\nTransaksi #${idx + 1} berhasil dihapus dari sistem.`, { parse_mode: 'Markdown', ...mainMenu });
    return;
  }

  // === Handler Tambah Transaksi ===
  if (data === 'add_transaction') {
    if (db.data.products.length === 0) {
      bot.sendMessage(chatId, '❌ *Tidak ada produk tersedia*\n\nTambahkan produk terlebih dahulu sebelum membuat transaksi.', { parse_mode: 'Markdown', ...mainMenu });
      return;
    }
    userState[chatId] = { action: 'add_transaction', step: 0, transaction: { items: [] } };
    const buttons = db.data.products.map((p, i) => [{ text: `🛒 ${p.name} - Rp${p.price.toLocaleString('id-ID')}`, callback_data: 'chooseprod_' + i }]);
    buttons.push([{ text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }]);
    bot.sendMessage(chatId, '🛒 *Tambah Transaksi Baru*\n\nPilih produk untuk transaksi:', { 
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons } 
    });
    return;
  }
  if (data.startsWith('chooseprod_')) {
    const idx = parseInt(data.split('_')[1]);
    const prod = db.data.products[idx];
    userState[chatId].step = 1;
    userState[chatId].selectedProduct = { idx, name: prod.name, price: prod.price };
    bot.sendMessage(chatId, `🔢 *Input Jumlah*\n\nProduk: ${prod.name}\nHarga: Rp${prod.price.toLocaleString('id-ID')}/pcs\n\nMasukkan jumlah (qty):`, { parse_mode: 'Markdown' });
    return;
  }
  if (data === 'add_more_product') {
    userState[chatId].step = 0;
    const buttons = db.data.products.map((p, i) => [{ text: `🛒 ${p.name} - Rp${p.price.toLocaleString('id-ID')}`, callback_data: 'chooseprod_' + i }]);
    buttons.push([{ text: '✅ Selesai & Checkout', callback_data: 'checkout_transaction' }]);
    bot.sendMessage(chatId, '🛒 *Tambah Produk Lagi*\n\nPilih produk tambahan atau checkout:', { 
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons } 
    });
    return;
  }
  if (data === 'checkout_transaction') {
    if (!userState[chatId]) {
      bot.sendMessage(chatId, '❌ Transaksi tidak valid atau sudah selesai. Silakan mulai transaksi baru.', { parse_mode: 'Markdown', ...mainMenu });
      return;
    }
    userState[chatId].step = 2;
    bot.sendMessage(chatId, '👤 *Data Pembeli*\n\nMasukkan nama pembeli:', { parse_mode: 'Markdown' });
    return;
  }

  // === Handler Lihat Produk ===
  if (data === 'view_products') {
    const products = db.data.products;
    if (products.length === 0) {
      bot.sendMessage(chatId, '📦 *Daftar Produk Kosong*\n\nBelum ada produk yang terdaftar.\nSilakan tambah produk terlebih dahulu.', { parse_mode: 'Markdown', ...mainMenu });
    } else {
      const list = products.map((p, i) => `${i + 1}. *${p.name}* - Rp${p.price.toLocaleString('id-ID')}`).join('\n');
      bot.sendMessage(chatId, `📦 *Daftar Produk* (${products.length} item)\n\n${list}`, { parse_mode: 'Markdown', ...mainMenu });
    }
    return;
  }

  // === Handler Lihat Transaksi ===
  if (data === 'view_transactions') {
    const trans = db.data.transactions;
    if (trans.length === 0) {
      bot.sendMessage(chatId, '📊 *Daftar Transaksi Kosong*\n\nBelum ada transaksi yang tercatat.\nMulai dengan membuat transaksi baru.', { parse_mode: 'Markdown', ...mainMenu });
    } else {
      const list = trans.map((t, i) => {
        if (t.items && Array.isArray(t.items)) {
          let items = t.items.map((item, idx) => `${item.name} x${item.qty}`).join(', ');
          return `${i + 1}. *${items}*\n   💰 Total: Rp${t.total.toLocaleString('id-ID')} | 👤 ${t.buyer}`;
        } else {
          return `${i + 1}. *${t.product} x${t.qty}*\n   👤 ${t.buyer}`;
        }
      }).join('\n\n');
      bot.sendMessage(chatId, `📊 *Daftar Transaksi* (${trans.length} transaksi)\n\n${list}`, { parse_mode: 'Markdown', ...mainMenu });
    }
    return;
  }

  // === Handler Bantuan ===
  if (data === 'help') {
    const helpMsg = `📚 *Panduan Penggunaan Bot Toko*

🔹 *Produk Management:*
• 📦 Tambah Produk - Menambah produk baru
• 🗑️ Hapus Produk - Menghapus produk yang ada
• 📋 Lihat Produk - Melihat daftar semua produk

🔹 *Transaksi Management:*
• 🛒 Tambah Transaksi - Membuat transaksi baru
• ❌ Hapus Transaksi - Menghapus transaksi
• 📊 Lihat Transaksi - Melihat riwayat transaksi

🔹 *Fitur Lainnya:*
• 📄 Download PDF - Unduh nota transaksi
• ⚙️ Bantuan - Panduan ini

💡 *Tips:* Pastikan sudah menambah produk sebelum membuat transaksi!`;
    bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown', ...mainMenu });
    return;
  }

  // === Handler Kembali ke Menu ===
  if (data === 'back_to_menu') {
    delete userState[chatId];
    bot.sendMessage(chatId, '🏠 *Kembali ke Menu Utama*\n\nPilih menu yang ingin Anda gunakan:', { parse_mode: 'Markdown', ...mainMenu });
    return;
  }
});

bot.on('message', async (msg) => {
  if (!botActive) return;
  const chatId = msg.chat.id;
  if (!userState[chatId]) return;
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
      bot.sendMessage(chatId, `✅ *Produk Berhasil Ditambahkan*\n\n📦 Produk: ${state.temp.name}\n💰 Harga: Rp${state.temp.price.toLocaleString('id-ID')}`, { parse_mode: 'Markdown', ...mainMenu });
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
      state.transaction.items.push({ name: prod.name, price: prod.price, qty, subtotal: prod.price * qty });
      delete userState[chatId].selectedProduct;
      // Tampilkan ringkasan transaksi dengan tombol tambah, kurangi, checkout
      let summary = state.transaction.items.map((item, i) => `${i + 1}. *${item.name}* x${item.qty} = Rp${item.subtotal.toLocaleString('id-ID')}`).join('\n');
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
      
      let summary = state.transaction.items.map((item, i) => `${i + 1}. *${item.name}* x${item.qty} (Rp${item.price.toLocaleString('id-ID')}/pcs) = Rp${item.subtotal.toLocaleString('id-ID')}`).join('\n');
      bot.sendMessage(chatId, `🎉 *Transaksi Berhasil!*\n\n📋 *Detail Transaksi:*\n${summary}\n\n💰 *Total: Rp${state.transaction.total.toLocaleString('id-ID')}*\n👤 *Pembeli: ${state.transaction.buyer}*\n📅 *Tanggal: ${new Date().toLocaleDateString('id-ID')}*`, { parse_mode: 'Markdown', ...mainMenu });
      delete userState[chatId];
    }
    return;
  }

  // === Handler Bantuan ===
  if (data === 'help') {
    const helpMsg = `📚 *Panduan Penggunaan Bot Toko*

🔹 *Produk Management:*
• 📦 Tambah Produk - Menambah produk baru
• 🗑️ Hapus Produk - Menghapus produk yang ada
• 📋 Lihat Produk - Melihat daftar semua produk

🔹 *Transaksi Management:*
• 🛒 Tambah Transaksi - Membuat transaksi baru
• ❌ Hapus Transaksi - Menghapus transaksi
• 📊 Lihat Transaksi - Melihat riwayat transaksi

🔹 *Fitur Lainnya:*
• 📄 Download PDF - Unduh nota transaksi
• ⚙️ Bantuan - Panduan ini

💡 *Tips:* Pastikan sudah menambah produk sebelum membuat transaksi!`;
    bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown', ...mainMenu });
    return;
  }

  // === Handler Kembali ke Menu ===
  if (data === 'back_to_menu') {
    delete userState[chatId];
    bot.sendMessage(chatId, '🏠 *Kembali ke Menu Utama*\n\nPilih menu yang ingin Anda gunakan:', { parse_mode: 'Markdown', ...mainMenu });
    return;
  }
});

// Handler menu kurangi produk
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  // ...existing code...
  if (data === 'remove_product_menu') {
    const state = userState[chatId];
    if (!state || !state.transaction || !state.transaction.items || state.transaction.items.length === 0) {
      bot.sendMessage(chatId, '❌ Tidak ada produk yang bisa dikurangi.', { parse_mode: 'Markdown' });
      return;
    }
    const buttons = state.transaction.items.map((item, i) => [{ text: `➖ ${item.name} x${item.qty}`, callback_data: `remove_product_${i}` }]);
    buttons.push([{ text: '🔙 Kembali', callback_data: 'back_to_summary' }]);
    bot.sendMessage(chatId, 'Pilih produk yang ingin dihapus dari transaksi:', { reply_markup: { inline_keyboard: buttons } });
    return;
  }
  if (data.startsWith('remove_product_')) {
    const idx = parseInt(data.split('_')[2]);
    const state = userState[chatId];
    if (!state || !state.transaction || !state.transaction.items || !state.transaction.items[idx]) {
      bot.sendMessage(chatId, '❌ Produk tidak ditemukan dalam transaksi.', { parse_mode: 'Markdown' });
      return;
    }
    state.transaction.items.splice(idx, 1);
    // Tampilkan ringkasan lagi
    let summary = state.transaction.items.map((item, i) => `${i + 1}. *${item.name}* x${item.qty} = Rp${item.subtotal.toLocaleString('id-ID')}`).join('\n');
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
    return;
  }
  if (data === 'back_to_summary') {
    const state = userState[chatId];
    let summary = state.transaction.items.map((item, i) => `${i + 1}. *${item.name}* x${item.qty} = Rp${item.subtotal.toLocaleString('id-ID')}`).join('\n');
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
    return;
  }
});