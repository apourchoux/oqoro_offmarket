// Modèles d'email de base (parité Mailer) : proposés en un clic quand la
// bibliothèque de templates est vide. Variables supportées : {{first_name}},
// {{last_name}}, {{email}}, {{unsubscribe_url}}.

export const BASE_TEMPLATES: Array<{ name: string; html: string }> = [
  {
    name: 'Email simple',
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { padding: 32px; text-align: center; background-color: #1a1a2e; color: #ffffff; }
    .content { padding: 32px; color: #333333; line-height: 1.6; }
    .footer { padding: 24px 32px; text-align: center; font-size: 12px; color: #999999; background-color: #f3f4f6; }
    .footer a { color: #666666; }
    h1 { margin: 0; font-size: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Oqoro</h1>
    </div>
    <div class="content">
      <p>Bonjour {{first_name}},</p>
      <p>Votre contenu ici...</p>
    </div>
    <div class="footer">
      <p>Oqoro &mdash; Off Market</p>
      <p><a href="{{unsubscribe_url}}">Se désinscrire</a></p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Email avec CTA',
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { padding: 32px; text-align: center; background-color: #1a1a2e; color: #ffffff; }
    .content { padding: 32px; color: #333333; line-height: 1.6; }
    .cta { text-align: center; padding: 16px 0; }
    .btn { display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
    .footer { padding: 24px 32px; text-align: center; font-size: 12px; color: #999999; background-color: #f3f4f6; }
    .footer a { color: #666666; }
    h1 { margin: 0; font-size: 24px; }
    h2 { color: #1a1a2e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Oqoro</h1>
    </div>
    <div class="content">
      <h2>Bonjour {{first_name}},</h2>
      <p>Nous avons une opportunité qui pourrait vous intéresser.</p>
      <p>Découvrez notre sélection de biens d'investissement off-market, avant leur mise sur le marché.</p>
      <div class="cta">
        <a href="https://offmarket.oqoro.com" class="btn">Découvrir les biens</a>
      </div>
      <p>À bientôt,<br>L'équipe Oqoro</p>
    </div>
    <div class="footer">
      <p>Oqoro &mdash; Off Market</p>
      <p><a href="{{unsubscribe_url}}">Se désinscrire</a></p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Email texte pur',
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; margin: 0; padding: 0; background-color: #ffffff; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #333333; line-height: 1.8; }
    .signature { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
    .footer { margin-top: 32px; font-size: 12px; color: #999999; }
    .footer a { color: #666666; }
  </style>
</head>
<body>
  <div class="container">
    <p>Bonjour {{first_name}},</p>
    <p>J'espère que vous allez bien.</p>
    <p>Je me permets de vous recontacter au sujet de votre projet immobilier. Nous serions ravis d'échanger avec vous sur nos opportunités off-market.</p>
    <p>N'hésitez pas à me répondre directement à cet email si vous souhaitez en discuter.</p>
    <div class="signature">
      <p><strong>L'équipe Oqoro</strong><br>
      Oqoro &mdash; Off Market<br>
      offmarket@oqoro.com</p>
    </div>
    <div class="footer">
      <p><a href="{{unsubscribe_url}}">Se désinscrire de nos communications</a></p>
    </div>
  </div>
</body>
</html>`,
  },
];
