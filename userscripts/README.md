# VEVO Firefox userscript

Install a Firefox userscript manager such as Tampermonkey or Violentmonkey. Create a new script, replace its contents with `vevo-helper.user.js`, and save it. Open:

https://online.immi.gov.au/evo/firstParty?actionType=query

Use **VEVO admin** in the bottom-right corner. Enter a profile name, passport number, TRN and date of birth. Optionally enter the country exactly as it appears in the official dropdown and a personal status note. **Save & fill** saves and applies the profile. The selected saved profile fills automatically on subsequent visits to the query URL.

Select a saved profile to edit it, then choose **Save & fill**. **New** creates another profile; **Delete** removes the selected profile. The panel shows the last saved and successfully filled times in your local timezone. **Fill saved details** retries filling without saving editor changes.

Review the official form, complete other required fields and submit yourself. The script does not submit queries, accept declarations, bypass CAPTCHA, or fetch visa results. The status note is editable personal information, not an official visa status or confirmation that a query succeeded.

Profiles are stored unencrypted in this userscript manager's storage, not in a server or repository. Anyone with access to that browser profile can access them. Deleting a profile does not clear details already entered into the website. Use only a trusted browser profile.

The form loads dynamically. The script waits up to roughly 16 seconds and matches field labels rather than changing server-generated IDs. If it reports missing fields, select Passport and the transaction reference number type on the website, then retry. Site changes or unusual date controls may require manual entry. Full live submission has not been tested with personal data.
