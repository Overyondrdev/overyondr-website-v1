/* Help center articles (ads.overyondrdev.com/help). Keep these in step with the portal: when a feature changes,
 * change its article here. roles: who it's for ('all', 'editor' = editors and admins, 'admin'). Body is trusted HTML. */
window.YONDR_HELP = {
  sections: [
    { id: 'start', title: 'Getting started', icon: 'compass', blurb: 'What the ad library is, signing in, and what your role lets you do.' },
    { id: 'find', title: 'Finding ads', icon: 'search', blurb: 'Filters, an ad’s details, statuses and badges, motion ads.' },
    { id: 'download', title: 'Downloading & using ads', icon: 'download', blurb: 'Files, zips, sizes, the 150 KB limit, ad copy for platforms.' },
    { id: 'feedback', title: 'Comments & reviews', icon: 'chat', blurb: 'Comment, suggest a change, approve or ask for changes.' },
    { id: 'edit', title: 'Editing ads', icon: 'pen', blurb: 'Change headlines, taglines and the CTA, upload and replace ads.', roles: 'editor' },
    { id: 'campaigns', title: 'Campaigns', icon: 'flag', blurb: 'Log where ads run, add ads, export to CSV.' },
    { id: 'admin', title: 'People & permissions', icon: 'people', blurb: 'Give people roles and follow what changed.', roles: 'admin' },
    { id: 'trouble', title: 'Troubleshooting', icon: 'wrench', blurb: 'Sign-in problems, missing buttons, saves that stopped.' },
    { id: 'privacy', title: 'Privacy & sharing', icon: 'lock', blurb: 'Who can see the ads, and sharing them safely.' },
  ],
  popular: ['download-zip', 'edit-ad', 'formats', 'roles', 'copy-specs', 'old-version'],
  articles: [
    // ------------------------------------------------------------------ Getting started
    { id: 'what-is', section: 'start', roles: 'all', title: 'What the ad library is', keys: 'about overview portal purpose',
      body: `<p>The ad library is where Yondr’s display ads live: every ad in every size, ready to preview, download and use, with the copy and specs that go with them.</p>
<ul><li><b>Ads</b> is the library itself, grouped by size or headline.</li><li><b>Campaigns</b> shows where ads run.</li><li><b>Copy &amp; specs</b> has the ad text for each platform, the specs and the source images.</li><li>Editors also see <b>Edit copy</b>; admins also see <b>People</b>.</li></ul>
<p>Ads come in <b>ad sets</b>: a group made together, like <i>Harvard Study 2026</i>. Switch sets with the menu at the top right.</p>` },
    { id: 'sign-in', section: 'start', roles: 'all', title: 'Signing in', keys: 'login log in code email access sign out session',
      body: `<ol><li>Go to <b>ads.overyondrdev.com</b>.</li><li>Enter your <b>@overyondr.com</b> email address.</li><li>Type the one-time code that arrives by email.</li></ol>
<p>You stay signed in for about a week on that browser. To sign out, use <b>Sign out</b> at the top right.</p>
<p class="tip">Only @overyondr.com addresses can sign in. If yours doesn’t work, see <a href="#cant-sign-in">I can’t sign in</a>.</p>` },
    { id: 'roles', section: 'start', roles: 'all', title: 'Viewer, editor and admin: what you can do', keys: 'permissions role access rights what can i do',
      body: `<p>Your role is shown next to your email at the top right.</p>
<table><thead><tr><th>Role</th><th>Can</th></tr></thead><tbody>
<tr><td><span class="badge">Viewer</span></td><td>Browse every ad, download them (one, a selection or all), copy the ad text, comment and suggest changes. Everyone starts as a viewer.</td></tr>
<tr><td><span class="badge editor">Editor</span></td><td>Everything viewers can do, plus edit headlines, taglines, descriptions and the button (the ads re-render), upload ads, replace files, set status and run dates, approve, and manage campaigns.</td></tr>
<tr><td><span class="badge admin">Admin</span></td><td>Everything editors can do, plus give people roles on the People tab and delete any ad or campaign.</td></tr></tbody></table>
<p>Need more access? Ask an admin (listed at the bottom of every help page).</p>` },
    { id: 'tour', section: 'start', roles: 'all', title: 'Taking the tour again', keys: 'tutorial walkthrough onboarding intro guide',
      body: `<p>The tour runs on your first visit, and again (shorter) when your role changes, to show what’s new for you.</p>
<p>Replay it any time: <b>Help → Take the tour</b> at the top of the library, or <a href="/?tour=1">start it now</a>.</p>` },
    { id: 'ad-sets', section: 'start', roles: 'all', title: 'Ad sets: switching and creating', keys: 'set collection campaign group new set switch',
      body: `<p>An ad set is a group of ads made together. Switch sets with the menu at the top right; the library remembers your last one.</p>
<p><span class="badge editor">Editors</span> can create a set: choose <b>+ New ad set…</b> in that menu, give it a name and a short description, then upload its ads.</p>` },

    // ------------------------------------------------------------------ Finding ads
    { id: 'filters', section: 'find', roles: 'all', title: 'Filtering and grouping ads', keys: 'filter size headline status group sort search find',
      body: `<p>The bar above the ads narrows the library:</p>
<ul><li><b>Show</b>: all, pouch stills, in-use stills or motion.</li><li><b>Size</b>: pick one or more sizes; the small shapes show each size’s proportions.</li><li><b>Headline</b>, <b>Status</b> and <b>Group by</b> (size or headline).</li></ul>
<p>Archived ads are hidden unless you choose <b>Every status</b> or <b>Archived</b>. Your filters are remembered next time. <b>Clear filters</b> resets them.</p>` },
    { id: 'ad-details', section: 'find', roles: 'all', title: 'An ad’s details', keys: 'open ad preview zoom full size details page next previous',
      body: `<p>Click any ad (or <b>Details</b>) to open it. You’ll see it at actual size (or <b>Zoom 2×</b>), its file, size, format and file size, status, campaigns and comments.</p>
<p>Use <kbd>←</kbd> <kbd>→</kbd> to move to the previous or next ad, and <kbd>Esc</kbd> to close.</p>` },
    { id: 'statuses', section: 'find', roles: 'all', title: 'What the statuses mean', keys: 'status in review approved needs changes archived',
      body: `<ul><li><b>In review</b>: new or just changed, waiting for a check. Edited ads go back to this automatically.</li><li><b>Approved</b>: ready to run.</li><li><b>Needs changes</b>: someone asked for a fix.</li><li><b>Archived</b>: kept but hidden from the library.</li></ul>
<p>Use approved ads in campaigns. <span class="badge editor">Editors</span> set statuses in an ad’s details, or for several ads at once from the selection bar.</p>` },
    { id: 'badges', section: 'find', roles: 'all', title: 'Badges on ad cards', keys: 'icons pills tick pencil comment own copy campaign red size',
      body: `<ul><li><b>Status</b> (In review, Approved…).</li><li><b>✓ 2</b>: two people approved it. <b>✎ 1</b>: one asked for changes.</li><li><b>💬 3</b>: three comments.</li><li><b>In 2 campaigns</b>: it’s used in two campaigns.</li><li><b>Own copy</b>: this ad’s text differs from the rest of its set (see <a href="#own-copy">Own copy</a>).</li><li>A <b>red file size</b> means the file is over 150 KB.</li></ul>` },
    { id: 'motion', section: 'find', roles: 'all', title: 'Motion ads', keys: 'animated gif animation length loop replay plays twice 30 seconds',
      body: `<p>Motion ads are animated GIFs, about 13.6 seconds long. They play twice (about 27 seconds, under the 30-second limit most ad networks set) and stop on the end card with the logo and button.</p>
<p>In an ad’s details, <b>↻ Replay</b> plays it again. A few of the larger motion ads use fewer than 256 colours to stay under 150 KB.</p>` },
    { id: 'links', section: 'find', roles: 'all', title: 'Sharing a link to an ad', keys: 'link url share send colleague address',
      body: `<p>When an ad is open, the address bar holds a direct link to it (it ends in <code>#ad=…</code>). Copy it and send it to a colleague: it opens straight to that ad. Links only work for people with an @overyondr.com email.</p>` },

    // ------------------------------------------------------------------ Downloading & using
    { id: 'download-one', section: 'download', roles: 'all', title: 'Downloading an ad', keys: 'download save file one single',
      body: `<p>Click the <b>↓</b> button on an ad card, or <b>Download</b> in its details. The file name says the set, headline, version and size, for example <code>harvard-study-2026-h1-pouch-300x250.jpg</code>.</p>` },
    { id: 'download-zip', section: 'download', roles: 'all', title: 'Downloading several ads, or all of them', keys: 'zip bulk all everything whole set multiple select batch',
      body: `<ol><li>Hover an ad and tick the box in its corner (or use <b>Select all</b> next to a size or headline).</li><li>In the bar at the bottom, choose <b>Download .zip</b>.</li></ol>
<p><b>Download all</b> at the top gets every ad in the set. In the zip, ads are in <code>still/</code> and <code>motion/</code> folders by size. Campaigns have their own <b>Download … ads (.zip)</b> button.</p>` },
    { id: 'formats', section: 'download', roles: 'all', title: 'File formats, sizes and the 150 KB limit', keys: 'jpeg jpg gif size dimensions kb limit spec iab',
      body: `<p>Stills are <b>JPEG</b> and motion ads are animated <b>GIF</b>. Every Harvard study ad is under <b>150 KB</b>, the limit most ad networks set.</p>
<table><thead><tr><th>Size</th><th>Name</th></tr></thead><tbody>
<tr><td>300×250</td><td>Inline Rectangle</td></tr><tr><td>336×280</td><td>Large Rectangle</td></tr><tr><td>728×90</td><td>Leaderboard</td></tr>
<tr><td>320×50</td><td>Mobile Leaderboard</td></tr><tr><td>300×600</td><td>Half Page</td></tr><tr><td>160×600</td><td>Wide Skyscraper</td></tr></tbody></table>` },
    { id: 'which-size', section: 'download', roles: 'all', title: 'Which size goes where', keys: 'placement mobile desktop banner sidebar choose',
      body: `<ul><li><b>300×250</b> and <b>336×280</b>: in articles and feeds, desktop and mobile. The most widely available.</li><li><b>728×90</b>: across the top of desktop pages.</li><li><b>320×50</b>: mobile banners.</li><li><b>300×600</b> and <b>160×600</b>: desktop sidebars.</li></ul>
<p>Upload every size you have: ad networks pick the one that fits each placement.</p>` },
    { id: 'copy-specs', section: 'download', roles: 'all', title: 'Ad copy for platforms', keys: 'headline description text responsive display google character count copy paste',
      body: `<p>The <b>Copy &amp; specs</b> tab has the headlines, long headline, descriptions and call to action, each with a copy button and its Google Ads character count (30 for headlines, 90 for descriptions). <b>Copy all as text</b> copies the lot. It also lists the specs.</p>` },
    { id: 'source-images', section: 'download', roles: 'all', title: 'Source images', keys: 'photo pouch cut out png original image assets',
      body: `<p>At the bottom of <b>Copy &amp; specs</b> you’ll find the pouch cut-out (PNG) and the photos used in the ads, for making other formats.</p>` },
    { id: 'click-through', section: 'download', roles: 'all', title: 'Where do clicks go?', keys: 'click through landing page url link destination utm tracking',
      body: `<p>The ads themselves don’t contain a link. The ads team sets the click-through URL (and any tracking) in each ad platform when they set up the campaign.</p>` },
    { id: 'platforms', section: 'download', roles: 'all', title: 'Using the ads in ad platforms', keys: 'google ads dv360 linkedin meta upload platform image ads',
      body: `<ol><li>Download approved ads in the sizes the campaign needs.</li><li>In the platform, create image (display) ads and upload the files.</li><li>Set the click-through URL there.</li><li>Log the campaign on the <b>Campaigns</b> tab so everyone knows which ads run where.</li></ol>
<p class="tip">Each platform has its own specs and some don’t animate GIFs. Check the platform’s current specs before launch.</p>` },

    // ------------------------------------------------------------------ Comments & reviews
    { id: 'comment', section: 'feedback', roles: 'all', title: 'Commenting on an ad', keys: 'comment feedback note design copy problem idea question',
      body: `<p>Open an ad, scroll to <b>Comments</b>, pick a kind (Design, Copy, Problem, Idea, Question, Love it), write your comment and choose <b>Post comment</b>. Everyone can see comments.</p>` },
    { id: 'suggest-change', section: 'feedback', roles: 'all', title: 'Suggesting a change to an ad', keys: 'suggest change request edit wording viewer',
      body: `<p>Open the ad and choose <b>Suggest a change</b>. It opens a <b>Copy</b> comment on that ad: say what it should say instead. Editors see an <b>Edit text</b> link right on your comment.</p>` },
    { id: 'review', section: 'feedback', roles: 'editor', title: 'Approving an ad or asking for changes', keys: 'approve review needs changes sign off',
      body: `<p>In an ad’s details, under <b>Review</b>, choose <b>✓ Approve</b> or <b>✎ Needs changes</b>. Click again to take it back. The card shows how many people chose each. To make it official, set the ad’s <a href="#status-dates">status</a> too.</p>` },

    // ------------------------------------------------------------------ Editing (editors)
    { id: 'edit-ad', section: 'edit', roles: 'editor', title: 'Editing an ad’s text', keys: 'edit change headline tagline button cta description wording text',
      body: `<ol><li>Click <b>Edit</b> on the ad’s card, or <b>Edit text</b> in its details.</li><li>Change the text. The preview shows exactly that ad as you type (motion ads jump to the scene you’re editing; <b>▶ Play</b> runs it).</li><li>Choose <a href="#edit-scope">every ad with this text or only this ad</a>.</li><li>Choose <b>Save</b>.</li></ol>
<p>You only see the text that ad shows: a 320×50 has a headline and button; a Half Page also has a description and source line; motion ads add the stat.</p>` },
    { id: 'edit-scope', section: 'edit', roles: 'editor', title: 'Every ad with this text, or only this ad?', keys: 'scope shared only this ad all ads consistent override',
      body: `<ul><li><b>Every ad with this text</b> (recommended) changes the shared copy, so every ad that shows it updates. The button tells you how many. A headline is shared by its 18 ads; the tagline and button by most of the set.</li><li><b>Only this ad</b> changes just this one, for example to shorten a line that’s cramped at one size. The ad gets the <b>Own copy</b> badge.</li></ul>` },
    { id: 'own-copy', section: 'edit', roles: 'all', title: 'Own copy', keys: 'own copy custom override different text one ad',
      body: `<p>An ad marked <b>Own copy</b> has text that differs from the rest of its set. Later set-wide edits leave that text alone on that ad.</p>
<p><span class="badge editor">Editors</span>: to undo it, open the ad, choose <b>Edit text</b>, then <b>Go back to the shared copy</b>.</p>` },
    { id: 'edit-copy-tab', section: 'edit', roles: 'editor', title: 'The Edit copy tab (set-wide changes)', keys: 'edit copy tab all at once bulk global set wide',
      body: `<p><b>Edit copy</b> shows every shared text in one place: tagline, buttons, the five headlines and descriptions, the stat and the source lines. Pick a headline, size and version to preview. The bar at the bottom shows how many ads your changes update. Changed fields are highlighted until you save or <b>Discard</b>.</p>` },
    { id: 'saving', section: 'edit', roles: 'editor', title: 'What happens when you save', keys: 'save render upload time minutes keep tab open in review progress stop',
      body: `<ol><li>Your browser re-renders each affected ad from the template, as sharp, small files (each under 150 KB).</li><li>The copy is saved and the new files replace the old ones.</li><li>Those ads go back to <b>In review</b>.</li></ol>
<p>Stills take a second; motion ads take 15 to 30 seconds each. A headline change (18 ads) takes about 2 minutes; the main button (about 75 ads) about 10. <b>Keep the tab open</b> until it finishes. <b>Stop</b> cancels before anything is saved.</p>` },
    { id: 'long-text', section: 'edit', roles: 'editor', title: 'When text is too long', keys: 'too long shrink fit characters limit counter red',
      body: `<p>Text that doesn’t fit its space shrinks to fit, so watch the preview: very long lines get small. The counter turns red past the suggested length (30 characters for headlines, the Google Ads limit). Shorter is almost always better in a display ad.</p>` },
    { id: 'browsers', section: 'edit', roles: 'editor', title: 'Which browsers can edit ads', keys: 'safari chrome edge firefox browser support',
      body: `<p>Editing re-renders ads in your browser, which works in <b>Chrome</b>, <b>Edge</b> and <b>Firefox</b>. Safari can’t render them; everything else in the library works in Safari.</p>` },
    { id: 'replace-file', section: 'edit', roles: 'editor', title: 'Replacing an uploaded ad’s file', keys: 'replace file update image upload new version',
      body: `<p>Ads uploaded as finished files can’t be re-rendered, so <b>Edit</b> offers <b>Replace file</b>. Choose the corrected file: it must be the same size and format. The ad keeps its comments, campaigns and history, and goes back to In review.</p>` },
    { id: 'upload', section: 'edit', roles: 'editor', title: 'Uploading new ads', keys: 'upload add new files drag drop jpeg gif png webp',
      body: `<ol><li>Choose <b>Upload ads</b> at the top.</li><li>Drop files in or choose them (JPEG, GIF, PNG or WebP). Each shows its size and a warning if it’s over 150 KB.</li><li>Adjust titles; set the headline, type, status and run dates for the batch.</li><li>Choose <b>Upload</b>.</li></ol>
<p>Size and animation are read from each file. Uploads go into the ad set you’re viewing.</p>` },
    { id: 'status-dates', section: 'edit', roles: 'editor', title: 'Setting status and run dates', keys: 'status dates run from until approved archive schedule',
      body: `<p>In an ad’s details, under <b>Status &amp; dates</b>, set the status, title and the dates it runs, then <b>Save</b>. To set the status of several ads, select them and use <b>Set status…</b> in the bar at the bottom.</p>` },
    { id: 'archive-delete', section: 'edit', roles: 'editor', title: 'Archiving or deleting an ad', keys: 'archive delete remove hide',
      body: `<p><b>Archive</b> (set the status to Archived) hides an ad but keeps it, with its comments and history. Prefer this.</p>
<p><b>Delete ad</b> removes it and its file for everyone. Only the person who uploaded it, or an admin, can delete.</p>` },

    // ------------------------------------------------------------------ Campaigns
    { id: 'campaigns', section: 'campaigns', roles: 'all', title: 'What campaigns are', keys: 'campaign track where running channel',
      body: `<p>The <b>Campaigns</b> tab logs where ads run: name, channel (Google Display, LinkedIn…), status, dates, owner, notes and the ads used. Everyone can see campaigns; <span class="badge editor">editors</span> create and change them.</p>` },
    { id: 'campaign-create', section: 'campaigns', roles: 'editor', title: 'Creating a campaign', keys: 'new campaign create add',
      body: `<p>Choose <b>+ New campaign</b> on the Campaigns tab, or select ads first and pick <b>+ New campaign</b> in the bar at the bottom to include them. Fill in the name, channel, status, dates, owner and notes.</p>` },
    { id: 'campaign-ads', section: 'campaigns', roles: 'editor', title: 'Adding and removing a campaign’s ads', keys: 'add ads remove ads campaign assign',
      body: `<ul><li>Select ads, then choose the campaign in <b>Add to campaign…</b> in the bar at the bottom.</li><li>Or open an ad and use <b>Campaigns</b> in its details.</li><li>To remove one, use <b>Remove</b> under it on the campaign, or the ✕ in the ad’s details.</li></ul>` },
    { id: 'campaign-export', section: 'campaigns', roles: 'all', title: 'Exporting campaigns to CSV', keys: 'export csv spreadsheet report excel',
      body: `<p><b>Export CSV</b> on the Campaigns tab downloads every campaign with its ads, one row per ad, for spreadsheets and reports.</p>` },
    { id: 'campaign-delete', section: 'campaigns', roles: 'editor', title: 'Changing or deleting a campaign', keys: 'edit campaign status delete campaign',
      body: `<p>Open the campaign to change its status from the menu, or choose <b>Edit details</b>. <b>Delete campaign</b> (for whoever added it, or an admin) removes the campaign but keeps the ads.</p>` },

    // ------------------------------------------------------------------ Admin
    { id: 'people', section: 'admin', roles: 'admin', title: 'Giving people roles', keys: 'people permissions access add user promote editor admin viewer remove',
      body: `<ol><li>Open the <b>People</b> tab.</li><li>Under <b>Give someone access</b>, enter their @overyondr.com email, pick a role and choose <b>Save</b>. Or change anyone’s role from the list.</li></ol>
<p>They don’t need to have visited first. Next time they sign in, a short tour shows them what they can now do. Setting someone back to viewer removes their extra access.</p>` },
    { id: 'owners', section: 'admin', roles: 'admin', title: 'Owners', keys: 'owner configuration cannot change',
      body: `<p>Owners are set in the portal’s configuration, are always admins, and can’t be changed from the People tab. Admins can’t change their own role either, so there’s always someone who can.</p>` },
    { id: 'activity', section: 'admin', roles: 'admin', title: 'Recent changes and help feedback', keys: 'activity log history audit feedback helpful',
      body: `<p>The bottom of the People tab lists recent changes (roles, copy edits, re-renders) and what people said in the help center’s <b>Was this helpful?</b>, so you can spot what’s confusing.</p>` },

    // ------------------------------------------------------------------ Troubleshooting
    { id: 'cant-sign-in', section: 'trouble', roles: 'all', title: 'I can’t sign in', keys: 'login problem code not arriving access denied',
      body: `<ul><li>Use your <b>@overyondr.com</b> address; others can’t sign in.</li><li>No code? Check spam, wait a minute and try again. Codes expire after a short while, so use the newest one.</li><li>Still stuck? Ask an admin (below).</li></ul>` },
    { id: 'no-edit', section: 'trouble', roles: 'all', title: 'I don’t see Edit, Upload or People', keys: 'missing button edit upload cant edit permission viewer',
      body: `<p>Those depend on your role (shown next to your email). Viewers don’t see Edit or Upload; only admins see People. Use <b>Suggest a change</b> on an ad, or ask an admin for editor access.</p>` },
    { id: 'save-stopped', section: 'trouble', roles: 'editor', title: 'A save stopped, or some ads didn’t upload', keys: 'failed error retry save stopped closed tab upload failed',
      body: `<p>If you chose <b>Stop</b> or closed the tab while rendering, nothing was saved. If some uploads failed, the message lists them: open the Edit view again and save once more. Ads that already updated aren’t affected.</p>` },
    { id: 'old-version', section: 'trouble', roles: 'all', title: 'I still see the old version of an ad', keys: 'old cached stale refresh not updated',
      body: `<p>Reload the page. If an older copy still shows, do a hard refresh (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>, or <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> on a Mac). Files you downloaded before the change don’t update: download again.</p>` },
    { id: 'safari', section: 'trouble', roles: 'editor', title: 'Saving edits doesn’t work in Safari', keys: 'safari error could not draw',
      body: `<p>Safari can’t re-render the ads. Use Chrome, Edge or Firefox to save copy edits; everything else works in Safari.</p>` },
    { id: 'over-limit', section: 'trouble', roles: 'all', title: 'A file is over 150 KB', keys: 'too big large file size kb limit rejected',
      body: `<p>Most ad networks reject files over 150 KB. Ads made in the library stay under it. For an uploaded file, ask whoever made it for a smaller export, then <a href="#replace-file">replace the file</a>.</p>` },
    { id: 'blurry', section: 'trouble', roles: 'all', title: 'An ad looks blurry or soft', keys: 'blurry soft pixelated sharp quality fuzzy out of focus resolution retina',
      body: `<p>Display ads are made at their exact size in pixels (a 300×250 is 300 by 250 pixels), because that’s what ad networks show. On high-resolution screens, and with <b>Zoom 2×</b>, any ad at that size looks a little soft up close. That’s expected, and it’s how it will look on websites too.</p>
<p>The ads are drawn at twice the size and then sharpened down, so photos stay as crisp as the size allows. Motion ads can look slightly grainier than stills because GIFs use at most 256 colours.</p>` },
    { id: 'zip', section: 'trouble', roles: 'all', title: 'The zip won’t download or open', keys: 'zip error download failed open archive',
      body: `<p>Large selections take a few seconds to prepare. If it fails, try again or download fewer ads. The zip opens with your computer’s built-in tools.</p>` },

    // ------------------------------------------------------------------ Privacy
    { id: 'privacy', section: 'privacy', roles: 'all', title: 'Who can see the ads', keys: 'private public share confidential secure access',
      body: `<p>Only people who sign in with an @overyondr.com email can open the library, its files or its links. The files aren’t public anywhere.</p>
<p class="tip">Please don’t share ads outside Yondr before they’re approved, and only use approved ads in campaigns.</p>` },
  ],
};
