/* ────────────────────────────────────────────────────────────────
   MAILER — sends one plain-text email through Gmail SMTP using an
   app password. Built on Node's own tls/net modules, no packages.
   ──────────────────────────────────────────────────────────────── */

const tls = require('tls');
const net = require('net');
const crypto = require('crypto');
const os = require('os');

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const oneLine = s => String(s).replace(/[\r\n]+/g, ' ').trim();
// RFC 2047 encoded-word, so names/subjects with any characters are header-safe
const encodeWord = s => `=?UTF-8?B?${b64(oneLine(s))}?=`;
const wrap76 = s => s.replace(/.{1,76}/g, '$&\r\n');

function buildMessage({ from, fromName, to, replyTo, replyToName, subject, text }) {
  const domain = from.split('@')[1] || 'localhost';
  const headers = [
    `From: ${encodeWord(fromName)} <${from}>`,
    `To: <${to}>`,
    replyTo ? `Reply-To: ${encodeWord(replyToName || replyTo)} <${replyTo}>` : null,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  return `${headers.join('\r\n')}\r\n\r\n${wrap76(b64(text.replace(/\r?\n/g, '\r\n')))}`;
}

/* Minimal SMTP conversation: greeting → EHLO → AUTH PLAIN → MAIL → RCPT → DATA → QUIT */
function sendMail(opts) {
  const {
    user, pass,
    host = 'smtp.gmail.com', port = 465, secure = true,   // Gmail: implicit TLS on 465
    timeoutMs = 20000,
  } = opts;
  const message = buildMessage({ ...opts, from: user });

  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });                       // plain mode is for local testing only
    socket.setEncoding('utf8');
    socket.setTimeout(timeoutMs, () => fail(new Error('SMTP timed out')));

    let buf = '';
    let waiting = null;                                    // resolver for the next full reply
    const replies = [];
    let done = false;

    function fail(err) {
      if (done) return;
      done = true;
      socket.destroy();
      reject(err);
    }

    socket.on('error', fail);
    socket.on('data', chunk => {
      buf += chunk;
      // A reply is complete when a line reads "NNN text" (space, not dash, after the code)
      let m;
      while ((m = buf.match(/^(?:\d{3}-[^\r\n]*\r?\n)*(\d{3})(?: [^\r\n]*)?\r?\n/))) {
        replies.push({ code: +m[1], text: m[0].trim() });
        buf = buf.slice(m[0].length);
      }
      if (waiting && replies.length) { const w = waiting; waiting = null; w(replies.shift()); }
    });

    const read = () => new Promise(r => (replies.length ? r(replies.shift()) : (waiting = r)));
    async function expect(cmd, ok) {
      if (cmd !== null) socket.write(cmd + '\r\n');
      const rep = await read();
      if (!ok.includes(rep.code)) {
        const shown = cmd && cmd.startsWith('AUTH') ? 'AUTH PLAIN ***' : cmd;
        throw new Error(`SMTP ${shown || 'greeting'} failed: ${rep.text}`);
      }
      return rep;
    }

    (async () => {
      await expect(null, [220]);
      await expect(`EHLO ${os.hostname() || 'localhost'}`, [250]);
      await expect(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString('base64')}`, [235]);
      await expect(`MAIL FROM:<${user}>`, [250]);
      await expect(`RCPT TO:<${opts.to}>`, [250, 251]);
      await expect('DATA', [354]);
      // dot-stuffing: a line starting with "." gets an extra "."
      await expect(message.replace(/\r\n\./g, '\r\n..') + '\r\n.', [250]);
      socket.write('QUIT\r\n');
      done = true;
      socket.end();
      resolve();
    })().catch(fail);
  });
}

module.exports = { sendMail, buildMessage };
