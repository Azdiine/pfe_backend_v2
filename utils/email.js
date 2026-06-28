const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendOtpEmail = async (to, code) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 16px;">
      <h2 style="color: #22C55E; text-align: center; margin-bottom: 8px;">Meatay</h2>
      <p style="text-align: center; color: #374151; font-size: 16px;">Votre code de vérification</p>
      <div style="text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111827; background: #ffffff; padding: 16px 32px; border-radius: 12px; border: 2px solid #22C55E; display: inline-block;">${code}</span>
      </div>
      <p style="text-align: center; color: #6B7280; font-size: 14px;">Ce code expire dans ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.</p>
      <p style="text-align: center; color: #9CA3AF; font-size: 12px; margin-top: 24px;">Si vous n'avez pas demandé ce code, ignorez cet email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Meatay - Code de vérification',
    html,
  });
};

module.exports = { sendOtpEmail };
