-- Seed one default email template so the Campaigns screen unblocks.
-- The template must carry {{unsubscribe_url}} — that is the only hard
-- requirement checked by loadEligibleTemplates().
insert into crm_message_template (template_key, channel, language, version, name, subject, body, is_active)
values (
  'default_newsletter',
  'email',
  'id',
  1,
  'Newsletter 20FIT',
  'Kabar terbaru dari 20FIT',
  '<p>Halo,</p>
<p>Terima kasih sudah menjadi bagian dari komunitas 20FIT.</p>
<p>{{body}}</p>
<p>Salam,<br>Tim 20FIT</p>
<p style="font-size:12px;color:#888;">Tidak ingin menerima email ini? <a href="{{unsubscribe_url}}">Berhenti berlangganan</a></p>',
  true
),
(
  'default_newsletter',
  'email',
  'en',
  1,
  '20FIT Newsletter',
  'Latest news from 20FIT',
  '<p>Hello,</p>
<p>Thank you for being part of the 20FIT community.</p>
<p>{{body}}</p>
<p>Best,<br>The 20FIT Team</p>
<p style="font-size:12px;color:#888;">Don''t want these emails? <a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  true
)
on conflict (template_key, language, version) do nothing;
