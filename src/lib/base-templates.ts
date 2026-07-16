// Modèles d'email de base (parité Mailer) : proposés en un clic quand la
// bibliothèque de templates est vide. Variables supportées : {{first_name}},
// {{last_name}}, {{email}}, {{unsubscribe_url}}.

export const BASE_TEMPLATES: Array<{ name: string; html: string }> = [
  {
    // Reprise fidèle et ÉDITABLE du design « Bien mis en avant » généré par
    // renderCampaignEmail : remplacez photo, titre, ville, badges, chiffres
    // et lien du bouton par les données du bien à mettre à la une.
    name: 'À la Une',
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F2F2F7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F7">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">

        <!-- ═══ En-tête ═══ -->
        <tr><td style="background:#1A1A2E;border-radius:12px 12px 0 0;padding:18px 28px">
          <span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:0.02em">OQORO</span>
          <span style="color:#8A8AA3;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;margin-left:10px">Off Market</span>
        </td></tr>

        <!-- ═══ Introduction ═══ -->
        <tr><td style="background:#ffffff;padding:28px 28px 8px 28px;color:#33334A;font-size:15px;line-height:1.6">
          <p style="margin:0 0 12px 0">Bonjour {{first_name}},</p>
          <p style="margin:0 0 20px 0">Nous avons sélectionné pour vous une nouvelle opportunité d'investissement locatif off-market, avant sa mise sur le marché.</p>
        </td></tr>

        <!-- ═══ Carte du bien à la une ═══ -->
        <tr><td style="background:#ffffff;padding:0 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ECECF1;border-radius:12px;overflow:hidden">
            <!-- Photo : remplacez l'URL (ou supprimez cette ligne <tr> si pas de photo) -->
            <tr><td><a href="https://offmarket.oqoro.com"><img src="REMPLACEZ_PAR_URL_PHOTO" alt="Photo du bien" width="600" style="width:100%;max-width:600px;height:auto;display:block;border-radius:12px 12px 0 0" /></a></td></tr>
            <tr><td style="padding:20px">
              <div style="font-size:19px;font-weight:800;color:#1A1A2E;line-height:1.3">Titre du bien à la une</div>
              <div style="font-size:14px;color:#77778C;margin-top:4px">Ville (Code postal)</div>
              <div style="margin-top:12px">
                <span style="display:inline-block;background:#F0F0F6;color:#55556B;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-right:6px">Colocation meublée</span>
                <span style="display:inline-block;background:#F0F0F6;color:#55556B;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-right:6px">120 m²</span>
                <span style="display:inline-block;background:#F0F0F6;color:#55556B;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-right:6px">5 lots</span>
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>
                <td align="center" style="padding:14px 8px;border:1px solid #ECECF1;border-radius:10px;background:#F8F8FB">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#77778C;font-weight:700">Prix</div>
                  <div style="font-size:18px;font-weight:800;color:#1A1A2E;margin-top:4px">450 000 €</div>
                </td>
                <td style="width:8px"></td>
                <td align="center" style="padding:14px 8px;border:1px solid #ECECF1;border-radius:10px;background:#F8F8FB">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#77778C;font-weight:700">Loyer mensuel CC</div>
                  <div style="font-size:18px;font-weight:800;color:#1A1A2E;margin-top:4px">3 200 €</div>
                </td>
                <td style="width:8px"></td>
                <td align="center" style="padding:14px 8px;border:1px solid #ECECF1;border-radius:10px;background:#F8F8FB">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#77778C;font-weight:700">Rentabilité brute</div>
                  <div style="font-size:18px;font-weight:800;color:#1A1A2E;margin-top:4px">8,5 %</div>
                </td>
              </tr></table>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>
                <td style="background:#1A1A2E;border-radius:10px">
                  <a href="https://offmarket.oqoro.com" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">Découvrir ce bien</a>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>

        <!-- ═══ Pied de page ═══ -->
        <tr><td style="background:#ffffff;border-radius:0 0 12px 12px;padding:24px 28px 28px 28px">
          <p style="margin:0;font-size:12px;color:#9A9AAF;line-height:1.6">
            OQORO Off Market · offmarket@oqoro.com<br/>
            Vous recevez cet email car vous êtes inscrit à nos opportunités off-market.
            <a href="{{unsubscribe_url}}" style="color:#77778C">Se désabonner</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },
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
