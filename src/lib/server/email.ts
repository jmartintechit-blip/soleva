const FROM = 'Soleva <noreply@solevaapp.com>';

// Resend's REST API through fetch: no SDK needed in the worker.
export async function sendOtpEmail(apiKey: string, to: string, otp: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: `Tu código de Soleva: ${otp}`,
      text: `Tu código para entrar en Soleva es ${otp}.\n\nCaduca en 10 minutos. Si no lo has pedido tú, ignora este correo.`,
    }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
}
