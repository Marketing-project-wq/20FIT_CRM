-- Seed one default email template so the Campaigns screen unblocks.
-- The template must carry {{unsubscribe_url}} — that is the only hard
-- requirement checked by loadEligibleTemplates().
insert into crm_message_template (template_key, channel, name, subject, body, is_active, version)
values (
  'default_newsletter',
  'email',
  'Newsletter 20FIT',
  'Kabar terbaru dari 20FIT',
  '<p>Halo,</p>
<p>Terima kasih sudah menjadi bagian dari komunitas 20FIT.</p>
<p>{{body}}</p>
<p>Salam,<br>Tim 20FIT</p>
<p style="font-size:12px;color:#888;">Tidak ingin menerima email ini? <a href="{{unsubscribe_url}}">Berhenti berlangganan</a></p>',
  true,
  1
)
on conflict (template_key, version) do nothing;
