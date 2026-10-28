const FROM = 'Soleva <noreply@solevaapp.com>';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

// Resend's REST API through fetch: no SDK needed in the worker.
export async function sendEmail(apiKey: string, { to, subject, text }: Email): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
}

export const otpEmail = (to: string, otp: string): Email => ({
  to,
  subject: `Tu código de Soleva: ${otp}`,
  text: `Tu código para entrar en Soleva es ${otp}.\n\nCaduca en 10 minutos. Si no lo has pedido tú, ignora este correo.`,
});

export const waitlistEmail = (to: string, confirmUrl: string, leaveUrl: string): Email => ({
  to,
  subject: 'Confirma tu sitio en la lista de Soleva',
  text: `Para entrar en la lista de espera de Soleva, confirma tu email aquí:\n${confirmUrl}\n\nSi no has sido tú, ignora este correo: sin confirmar, lo borramos en 7 días.\n\nPara salir de la lista en cualquier momento:\n${leaveUrl}`,
});
