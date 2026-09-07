(() => {
  'use strict';

  const FIRESTORE_PROJECT = 'studio-7293379319-74783';
  const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;
  const LIVE = 'https://hgunews.com';
  const CATEGORIES = {
    Campus: 'キャンパス', Event: 'イベント', Interview: 'インタビュー',
    Sports: 'スポーツ', Column: 'コラム', Opinion: 'オピニオン'
  };
  const CATEGORY_ORDER = Object.keys(CATEGORIES);
  const INFO = [
    ['about', '新聞会について'], ['greeting', '会長挨拶'], ['recruit', '部員募集'],
    ['social', '公式SNS'], ['ads', '広告募集'], ['contact', 'お問い合わせ']
  ];
  const SAFE_IMAGE_HOSTS = new Set(['res.cloudinary.com', 'assets.st-note.com']);

  const state = { articles: [], greeting: null, ready: false, error: null };
  const main = document.getElementById('content');
  const status = document.querySelector('[data-status]');
  const address = document.querySelector('[data-address]');
  const windowTitle = document.getElementById('window-title');

  function esc(value) {
    return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  }
  function decodeValue(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x]) => [k, decodeValue(x)]));
    if ('referenceValue' in v) return v.referenceValue;
    return null;
  }
  function decodeDocument(doc) {
    const fields = Object.fromEntries(Object.entries(doc.fields || {}).map(([k,v]) => [k, decodeValue(v)]));
    return { id: doc.name.split('/').pop(), ...fields };
  }
  async function fetchJSON(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function fetchArticles() {
    const query = {
      structuredQuery: {
        from: [{ collectionId: 'articles' }],
        where: { fieldFilter: { field: { fieldPath: 'isPublished' }, op: 'EQUAL', value: { booleanValue: true } } },
        orderBy: [{ field: { fieldPath: 'publishDate' }, direction: 'DESCENDING' }],
        limit: 100
      }
    };
    try {
      const rows = await fetchJSON(`${FIRESTORE_BASE}:runQuery`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(query)
      });
      return rows.filter(x => x.document).map(x => decodeDocument(x.document));
    } catch (firstError) {
      const fallback = await fetchJSON(`${FIRESTORE_BASE}/articles?pageSize=100`);
      return (fallback.documents || []).map(decodeDocument).filter(a => a.isPublished).sort((a,b) => String(b.publishDate).localeCompare(String(a.publishDate)));
    }
  }
  async function fetchGreeting() {
    try {
      return decodeDocument(await fetchJSON(`${FIRESTORE_BASE}/settings/president_greeting`));
    } catch { return null; }
  }
  function dateText(value) { return String(value || '').slice(0,10).replaceAll('-', '.'); }
  function categoryLabel(key) { return CATEGORIES[key] || key || '記事'; }
  function routeHref(path = '') { return `#/${path.replace(/^\//,'')}`; }
  function articleHref(a) { return routeHref(`articles/${a.id}`); }
  function imageHTML(url, alt, cls = '', eager = false) {
    if (!url) return '';
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !SAFE_IMAGE_HOSTS.has(u.hostname)) return '';
    } catch { return ''; }
    return `<img class="${cls}" src="${esc(url)}" alt="${esc(alt || '')}" ${eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  function meta(a) {
    return `<div class="article-meta"><a class="category" href="${routeHref(`category/${esc(a.categoryId)}`)}">${esc(categoryLabel(a.categoryId))}</a><time>${esc(dateText(a.publishDate))}</time></div>`;
  }
  function setChrome(title, logicalPath, statusText) {
    windowTitle.textContent = `${title} - 北海学園大学新聞`;
    document.title = `${title}｜北海学園大学新聞`;
    address.textContent = `hgunews://${logicalPath || 'home'}`;
    status.textContent = statusText || title;
    document.querySelectorAll('[data-tree] a').forEach(a => a.removeAttribute('aria-current'));
    const match = document.querySelector(`[data-tree] a[data-route="${CSS.escape(logicalPath || 'home')}"]`);
    if (match) match.setAttribute('aria-current','page');
  }
  function sanitizeRich(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    const allowed = new Set(['P','H2','H3','H4','STRONG','EM','B','I','U','S','BLOCKQUOTE','UL','OL','LI','FIGURE','FIGCAPTION','DIV','SPAN','A','IMG','BR','TABLE','THEAD','TBODY','TR','TD','TH','HR','SUP','SUB']);
    [...root.querySelectorAll('*')].forEach(el => {
      if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      [...el.attributes].forEach(attr => {
        if (!['href','src','alt'].includes(attr.name)) el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A') {
        const href = el.getAttribute('href') || '';
        try {
          const u = new URL(href, LIVE);
          if (!['http:','https:'].includes(u.protocol)) throw new Error();
          el.href = u.hostname === 'hgunews.com' ? routeHref(u.pathname) : u.href;
          if (u.hostname !== 'hgunews.com') { el.target='_blank'; el.rel='noopener'; }
        } catch { el.removeAttribute('href'); }
      }
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') || '';
        try {
          const u = new URL(src);
          if (u.protocol !== 'https:' || !SAFE_IMAGE_HOSTS.has(u.hostname)) throw new Error();
          el.loading='lazy'; el.decoding='async';
          if (!el.alt) el.alt='記事内の写真';
        } catch { el.remove(); }
      }
    });
    return root.innerHTML;
  }
  function tocFrom(container) {
    const headings = [...container.querySelectorAll('h2,h3,h4')];
    headings.forEach((h,i) => h.id = `section-${i+1}`);
    if (!headings.length) return '<p>この記事には小見出しがありません。</p>';
    return `<ol class="toc-list">${headings.map(h => `<li><a href="#${h.id}">${esc(h.textContent.trim())}</a></li>`).join('')}</ol>`;
  }
  function infoTabs(current) {
    return `<nav class="category-tabs" aria-label="新聞会の案内">${INFO.map(([path,label]) => `<a class="classic-tab" href="${routeHref(path)}" ${current===path?'aria-current="page"':''}>${esc(label)}</a>`).join('')}</nav>`;
  }
  function group(title, body) { return `<fieldset class="classic-group"><legend>${esc(title)}</legend>${body}</fieldset>`; }
  function button(href,label) { return `<a class="document-button" href="${href}">${esc(label)}</a>`; }

  function renderHome() {
    const news = state.articles.filter(a => a.categoryId !== 'Viewer');
    const papers = state.articles.filter(a => a.categoryId === 'Viewer');
    const first = news[0];
    setChrome('トップ','home',`${news.length}件の記事`);
    if (!first) return renderError('公開記事を読み込めませんでした。');
    const hero = `<section><div class="sectionbar"><h1>最新のニュース</h1><span>${esc(dateText(first.publishDate))}</span></div><div class="lead-grid"><article class="lead-story"><a class="hero-image" href="${articleHref(first)}">${imageHTML(first.mainImageUrl,first.title,'',true)}</a>${meta(first)}<h2><a href="${articleHref(first)}">${esc(first.title)}</a></h2><p class="excerpt">${esc(stripHTML(first.content).slice(0,150))}${stripHTML(first.content).length>150?'…':''}</p><a class="read-button" href="${articleHref(first)}">記事を読む →</a></article><div class="secondary-list">${news.slice(1,3).map(a=>`<article class="secondary-story"><a class="story-thumb" href="${articleHref(a)}">${imageHTML(a.mainImageUrl,a.title)}</a>${meta(a)}<h3><a href="${articleHref(a)}">${esc(a.title)}</a></h3></article>`).join('')}</div></div></section>`;
    const cards = `<section><div class="block-heading"><h2>新着記事</h2><span>${Math.min(6,Math.max(0,news.length-3))}件</span></div><div class="news-grid">${news.slice(3,9).map(a=>`<article class="story-card"><a class="story-thumb" href="${articleHref(a)}">${imageHTML(a.mainImageUrl,a.title)}</a><div>${meta(a)}<h3><a href="${articleHref(a)}">${esc(a.title)}</a></h3></div></article>`).join('')}</div></section>`;
    const paper = papers[0] ? `<section class="classic-panel"><h2 class="panel-title">紙面を読む</h2><div class="panel-body paper-mini"><a href="${articleHref(papers[0])}">${imageHTML(papers[0].mainImageUrl,papers[0].title)}</a><strong>${esc(papers[0].title)}</strong><p>${esc(dateText(papers[0].publishDate))}</p>${button(articleHref(papers[0]),'この号を読む')}</div></section>` : '';
    const info = `<section class="classic-panel"><h2 class="panel-title">新聞会から</h2><div class="panel-body"><nav>${INFO.map(([p,l])=>`<a href="${routeHref(p)}">${esc(l)}</a>`).join('')}</nav></div></section>`;
    const categories = `<section class="category-directory"><div class="block-heading"><h2>カテゴリーから読む</h2></div><div class="category-columns">${CATEGORY_ORDER.map(key=>{const items=news.filter(a=>a.categoryId===key).slice(0,2);return `<section class="category-column"><h3><a href="${routeHref(`category/${key}`)}">${esc(CATEGORIES[key])} →</a></h3><ul>${items.map(a=>`<li><a href="${articleHref(a)}">${esc(a.title)}</a></li>`).join('')||'<li>記事はまだありません。</li>'}</ul></section>`}).join('')}</div></section>`;
    main.innerHTML = hero + `<div class="news-layout">${cards}<aside class="sidebar">${paper}${info}</aside></div>` + categories;
  }
  function stripHTML(source) {
    const doc = new DOMParser().parseFromString(source || '', 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g,' ').trim();
  }
  function renderCategory(key) {
    const label = categoryLabel(key); const items = state.articles.filter(a=>a.categoryId===key);
    setChrome(label,`category/${key}`,`${label} · ${items.length}件`);
    const tabs = `<nav class="category-tabs" aria-label="記事カテゴリー"><a class="classic-tab" href="#/">最新記事</a>${CATEGORY_ORDER.map(k=>`<a class="classic-tab" href="${routeHref(`category/${k}`)}" ${k===key?'aria-current="page"':''}>${esc(CATEGORIES[k])}</a>`).join('')}</nav>`;
    const body = items.length ? items.map(a=>`<article class="directory-story"><a class="story-thumb" href="${articleHref(a)}">${imageHTML(a.mainImageUrl,a.title)}</a><div><time>${esc(dateText(a.publishDate))}</time><h2><a href="${articleHref(a)}">${esc(a.title)}</a></h2></div></article>`).join('') : `<div class="empty-state">このカテゴリーの公開記事は見つかりませんでした。<br>${button(`${LIVE}/category/${encodeURIComponent(key)}`,'現行サイトを確認')}</div>`;
    main.innerHTML = tabs + `<section class="tab-sheet"><header class="category-header"><h1>${esc(label)}</h1><span>${items.length}件の記事</span></header><div>${body}</div></section>`;
  }
  function renderArticle(id) {
    const a = state.articles.find(x=>x.id===id);
    if (!a) return renderNotFound();
    if (a.categoryId === 'Viewer') return renderPaper(a);
    const label=categoryLabel(a.categoryId); setChrome(a.title,`articles/${id}`,`${label} · ${dateText(a.publishDate)}`);
    const related=state.articles.filter(x=>x.categoryId===a.categoryId&&x.id!==a.id).slice(0,3);
    main.innerHTML = `<nav class="breadcrumbs"><a href="#/">トップ</a><span>›</span><a href="${routeHref(`category/${a.categoryId}`)}">${esc(label)}</a><span>›</span><span>記事</span></nav><div class="category-tabs"><a class="classic-tab" aria-current="page" href="#">記事を読む</a><a class="classic-tab" href="${LIVE}/articles/${esc(a.id)}" target="_blank" rel="noopener">原文</a></div><section class="tab-sheet"><div class="reader-toolbar"><div class="size-control"><span>文字サイズ</span><button class="raised" data-size="normal">標準</button><button class="raised" data-size="large">大</button><button class="raised" data-size="largest">特大</button></div>${button(routeHref(`category/${a.categoryId}`),'一覧に戻る')}</div><div class="reader-grid"><article class="reader-document"><header class="reader-heading"><span class="reader-kicker">${esc(label)}</span><h1>${esc(a.title)}</h1><div class="reader-byline"><time>${esc(dateText(a.publishDate))}</time><span>${esc(a.authorName||'北海学園大学新聞会')}</span></div></header>${a.mainImageUrl?`<figure class="reader-hero">${imageHTML(a.mainImageUrl,a.mainImageCaption||a.caption||a.title,'',true)}${a.mainImageCaption||a.caption?`<figcaption>${esc(a.mainImageCaption||a.caption)}</figcaption>`:''}</figure>`:''}<div class="article-prose" data-prose>${sanitizeRich(a.content)}</div></article><aside class="reader-aside"><fieldset><legend>目次</legend><div data-toc></div></fieldset><fieldset><legend>同じカテゴリーの記事</legend><nav class="related-links">${related.map(x=>`<a href="${articleHref(x)}">${esc(x.title)}</a>`).join('')||'<span>ほかの記事はありません。</span>'}</nav></fieldset></aside></div></section>`;
    const prose=main.querySelector('[data-prose]'); main.querySelector('[data-toc]').innerHTML=tocFrom(prose);
    main.querySelectorAll('[data-size]').forEach(btn=>btn.addEventListener('click',()=>{prose.classList.remove('size-large','size-largest');if(btn.dataset.size==='large')prose.classList.add('size-large');if(btn.dataset.size==='largest')prose.classList.add('size-largest')}));
  }
  function renderPaper(a) {
    setChrome(a.title,`articles/${a.id}`,`紙面 · ${dateText(a.publishDate)}`);
    const pages = Array.isArray(a.paperImages) ? a.paperImages.filter(Boolean) : [];
    const images = pages.length ? pages : [a.mainImageUrl].filter(Boolean);
    main.innerHTML = `<nav class="breadcrumbs"><a href="#/">トップ</a><span>›</span><a href="#/viewer">紙面アーカイブ</a><span>›</span><span>${esc(a.title)}</span></nav><section class="classic-panel"><h1 class="panel-title">北海学園大学新聞 ${esc(a.title)}</h1><div class="paper-controls"><button class="raised" type="button" data-prev>前の面</button><select data-paper-select>${images.map((_,i)=>`<option value="${i}">${i+1}面 / 全${images.length}面</option>`).join('')}</select><button class="raised" type="button" data-next>次の面</button><a class="document-button" href="${LIVE}/articles/${esc(a.id)}" target="_blank" rel="noopener">現行サイト</a></div><div class="paper-stage inset">${images.map((url,i)=>`<figure class="paper-sheet" data-page="${i}" ${i?'hidden':''}>${imageHTML(url,`${a.title} ${i+1}面`, '', i===0)}<figcaption class="paper-status">${i+1}面 / 全${images.length}面</figcaption></figure>`).join('')||'<p class="paper-status">紙面画像を取得できませんでした。</p>'}</div></section>`;
    if (!images.length) return;
    const select=main.querySelector('[data-paper-select]'), sheets=[...main.querySelectorAll('[data-page]')], prev=main.querySelector('[data-prev]'), next=main.querySelector('[data-next]');
    const show=i=>{i=Math.max(0,Math.min(i,sheets.length-1));select.value=String(i);sheets.forEach((x,n)=>x.hidden=n!==i);prev.disabled=i===0;next.disabled=i===sheets.length-1};
    select.addEventListener('change',()=>show(Number(select.value)));prev.addEventListener('click',()=>show(Number(select.value)-1));next.addEventListener('click',()=>show(Number(select.value)+1));show(0);
  }
  function renderViewer() {
    const papers=state.articles.filter(a=>a.categoryId==='Viewer'); setChrome('紙面アーカイブ','viewer',`${papers.length}件の紙面`);
    main.innerHTML = `<section class="classic-panel"><h1 class="panel-title">紙面アーカイブ</h1><div class="archive-grid inset">${papers.map(a=>`<article class="archive-item"><a class="archive-cover" href="${articleHref(a)}">${imageHTML(a.mainImageUrl,a.title)}</a><h2><a href="${articleHref(a)}">${esc(a.title)}</a></h2><p>${esc(dateText(a.publishDate))} 発行 · ${(a.paperImages||[]).length}面</p>${button(articleHref(a),'紙面を開く')}</article>`).join('')||'<p class="empty-state">公開紙面を取得できませんでした。</p>'}</div></section>`;
  }
  function renderAbout() {
    setChrome('新聞会について','about','新聞会について');
    main.innerHTML = infoTabs('about')+`<section class="tab-sheet"><header class="information-heading"><h1>北海学園大学新聞会とは</h1><p>学生の視点から、大学の「今」を伝える。</p></header><div class="info-grid">${group('私たちの目的','<p>学生の視点から社会や大学の事象を捉え、批判的かつ創造的な言論空間を維持することを目指しています。</p>')}${group('活動内容','<ul class="classic-list"><li>定期的な紙面の発行</li><li>ウェブサイトでのニュース配信</li><li>学内各部活動への取材</li><li>公式行事の報道写真撮影</li></ul>')}</div>${group('組織概要','<dl class="property-list"><div><dt>団体名</dt><dd>北海学園大学新聞会</dd></div><div><dt>設立</dt><dd>1950年</dd></div><div><dt>新聞の創刊</dt><dd>1952年</dd></div><div><dt>活動拠点</dt><dd>北海学園大学 豊平キャンパス 文化棟二階</dd></div><div><dt>所在地</dt><dd>北海道札幌市豊平区旭町4丁目1-40</dd></div></dl>')}<div class="dialog-actions">${button('#/greeting','会長挨拶を読む')}${button('#/viewer','紙面を読む')}</div></section>`;
  }
  function renderGreeting() {
    setChrome('会長挨拶','greeting','会長挨拶'); const g=state.greeting;
    const body=g?.content?sanitizeRich(g.content):'<p>会長挨拶の公開データを取得できませんでした。現行サイトをご確認ください。</p>';
    main.innerHTML=infoTabs('greeting')+`<section class="tab-sheet" style="padding:0"><div class="letter-layout"><article class="letter-page"><header class="letter-heading"><p>北海学園大学新聞会</p><h1>${esc(g?.title||'会長挨拶')}</h1></header><div class="article-prose">${body}</div><div class="signature"><span>北海学園大学新聞会 会長</span><strong>${esc(g?.authorName||'')}</strong></div></article><aside>${g?.authorImageUrl?`<div class="portrait">${imageHTML(g.authorImageUrl,`会長 ${g.authorName||''}`,'',true)}<p>${esc(g.authorName||'')}</p></div>`:''}${group('関連ページ','<nav class="related-links"><a href="#/about">新聞会について</a><a href="#/recruit">部員募集</a><a href="#/contact">お問い合わせ</a></nav>')}</aside></div></section>`;
  }
  function renderRecruit() {
    setChrome('部員募集','recruit','部員募集');
    const roles=[['記者・ライター','学内のニュース、インタビュー、コラムの執筆を担当。あなたの視点で記事を形にします。'],['カメラマン','スポーツ大会やイベント、インタビュー現場の撮影を担当。決定的な瞬間を記録します。'],['編集・デザイン','紙面のレイアウトやウェブサイトの管理を担当。情報を美しく、読みやすく整えます。']];
    main.innerHTML=infoTabs('recruit')+`<section class="tab-sheet"><header class="information-heading"><h1>部員募集</h1><p>未経験者も歓迎。大学の「いま」を、一緒に形にしませんか。</p></header><div class="category-columns">${roles.map(([t,c])=>group(t,`<p>${esc(c)}</p>`)).join('')}</div>${group('新聞会で得られること','<ul class="classic-list"><li>取材・執筆スキルが身につく</li><li>著名人やリーダーから直接話を聞く機会</li><li>他学部、多学年の仲間とのつながり</li><li>自分の作った成果が形になり、多くの人に届く喜び</li></ul>')}<div class="dialog-actions">${button('#/contact','入部・見学について問い合わせる')}</div></section>`;
  }
  function renderSocial() {
    setChrome('公式SNS','social','公式SNS');
    const rows=[['X','X（旧Twitter）','@HGU_news','北海学園大学の最新ニュースを発信しています。','https://x.com/HGU_news'],['IG','Instagram','@hgu_news','取材現場の様子や、紙面に載りきらなかった写真を公開しています。','https://www.instagram.com/hgu_news'],['n','note','北海学園大学新聞','長期連載や、記者によるコラムなどをアーカイブしています。','https://note.com/lucky_minnow287']];
    main.innerHTML=infoTabs('social')+`<section class="tab-sheet"><header class="information-heading"><h1>公式SNS</h1><p>北海学園大学新聞の公式アカウント</p></header><div class="connection-list">${rows.map(([m,n,a,d,u])=>`<article class="connection-row"><span class="connection-mark">${esc(m)}</span><div><h2>${esc(n)}</h2><p>${esc(a)}</p><p>${esc(d)}</p></div><a class="document-button" href="${esc(u)}" target="_blank" rel="noopener">開く</a></article>`).join('')}</div></section>`;
  }
  function renderAds() {
    setChrome('広告募集','ads','広告募集');
    main.innerHTML=infoTabs('ads')+`<section class="tab-sheet"><header class="information-heading"><h1>広告募集</h1><p>北海学園大学の学生・教職員に向けた広告掲載</p></header>${group('広告媒体','<dl class="property-list"><div><dt>紙面広告</dt><dd>学内で配布する新聞紙面</dd></div><div><dt>バナー広告</dt><dd>ウェブサイト</dd></div><div><dt>記事広告</dt><dd>内容・目的に応じてご相談</dd></div></dl>')}${group('掲載までの流れ','<ol class="classic-list"><li>お問い合わせ</li><li>掲載プラン・お見積りのご提案</li><li>原稿入稿・内容確認</li><li>掲載開始</li></ol>')}<div class="dialog-actions">${button('#/contact','広告掲載について問い合わせる')}</div></section>`;
  }
  function renderContact() {
    setChrome('お問い合わせ','contact','お問い合わせ');
    main.innerHTML=infoTabs('contact')+`<section class="tab-sheet"><header class="information-heading"><h1>お問い合わせ</h1><p>取材依頼・情報提供・広告掲載・入部希望</p></header><div class="info-grid">${group('メール','<p>公式メールアドレス</p><div class="copy-field"><input id="email-field" value="r06hgunews@gmail.com" readonly><button class="document-button" type="button" data-copy>コピー</button></div><div class="dialog-actions"><a class="document-button" href="mailto:r06hgunews@gmail.com">メールを作成</a></div>')}${group('Instagram','<p>@hgu_news</p><p>ダイレクトメッセージからのご連絡も可能です。</p><div class="dialog-actions"><a class="document-button" href="https://www.instagram.com/hgu_news" target="_blank" rel="noopener">Instagramを開く</a></div>')}</div>${group('活動拠点','<p>北海学園大学 豊平キャンパス内<br>文化棟二階 北海学園大学新聞部室</p>')}</section>`;
    main.querySelector('[data-copy]')?.addEventListener('click',async()=>{const input=main.querySelector('#email-field');try{await navigator.clipboard.writeText(input.value);status.textContent='メールアドレスをコピーしました。'}catch{input.select();status.textContent='メールアドレスを選択しました。'}});
  }
  function renderSearch(query='') {
    setChrome('記事検索','search','記事検索'); const q=query.trim();
    const normalized=s=>s.normalize('NFKC').toLocaleLowerCase('ja'); const terms=normalized(q).split(/\s+/).filter(Boolean);
    const matches=terms.length?state.articles.filter(a=>{const hay=normalized(`${a.title||''} ${categoryLabel(a.categoryId)} ${stripHTML(a.content)}`);return terms.every(t=>hay.includes(t));}):[];
    main.innerHTML=`<section class="classic-panel"><h1 class="panel-title">記事の検索</h1><div class="search-page"><form data-page-search><label for="page-search">検索するキーワード</label><div class="search-field"><input id="page-search" type="search" value="${esc(q)}"><button class="document-button" type="submit">検索</button></div></form><p class="search-count">${q?`「${esc(q)}」の検索結果：${matches.length}件`:`キーワードを入力してください。全${state.articles.filter(a=>a.categoryId!=='Viewer').length}件の記事から検索できます。`}</p><div class="search-results">${q?(matches.map(a=>`<article class="search-result"><small>${esc(categoryLabel(a.categoryId))} · ${esc(dateText(a.publishDate))}</small><h2><a href="${articleHref(a)}">${esc(a.title)}</a></h2><p>${esc(stripHTML(a.content).slice(0,120))}${stripHTML(a.content).length>120?'…':''}</p></article>`).join('')||'<p class="empty-state">該当する記事がありません。</p>'):'<p class="empty-state">キーワードを入力して検索してください。</p>'}</div></div></section>`;
    main.querySelector('[data-page-search]').addEventListener('submit',e=>{e.preventDefault();const value=main.querySelector('#page-search').value.trim();location.hash=`#/search${value?`?q=${encodeURIComponent(value)}`:''}`;});
  }
  function renderError(message) { setChrome('接続エラー','error','接続エラー'); main.innerHTML=`<section class="classic-panel error-box"><h1 class="panel-title">データを読み込めません</h1><div class="error-row"><span class="error-symbol">×</span><div><h1>公開データへの接続に失敗しました。</h1><p>${esc(message)}</p><div class="dialog-actions"><a class="document-button" href="${LIVE}" target="_blank" rel="noopener">現行サイトを開く</a><button class="document-button" type="button" onclick="location.reload()">再読み込み</button></div></div></div></section>`; }
  function renderNotFound() { setChrome('ページが見つかりません','404','ページが見つかりません'); main.innerHTML=`<section class="classic-panel error-box"><h1 class="panel-title">ページが見つかりません</h1><div class="error-row"><span class="error-symbol">×</span><div><h1>指定されたページを開けませんでした。</h1><p>トップページまたは記事検索からお探しください。</p><div class="dialog-actions">${button('#/','トップページ')}${button('#/search','記事検索')}</div></div></div></section>`; }

  function parseRoute() {
    const raw=(location.hash||'#/').replace(/^#\/?/,''); const [path,query='']=raw.split('?');
    return { parts:path.split('/').filter(Boolean), params:new URLSearchParams(query) };
  }
  function route() {
    document.querySelectorAll('[data-popup][open]').forEach(x=>x.removeAttribute('open'));
    const {parts,params}=parseRoute();
    if (!state.ready) return;
    if (!parts.length) renderHome();
    else if (parts[0]==='category'&&parts[1]) renderCategory(parts[1]);
    else if (parts[0]==='articles'&&parts[1]) renderArticle(parts[1]);
    else if (parts[0]==='viewer') renderViewer();
    else if (parts[0]==='about') renderAbout();
    else if (parts[0]==='greeting') renderGreeting();
    else if (parts[0]==='recruit') renderRecruit();
    else if (parts[0]==='social') renderSocial();
    else if (parts[0]==='ads') renderAds();
    else if (parts[0]==='contact') renderContact();
    else if (parts[0]==='search') renderSearch(params.get('q')||'');
    else renderNotFound();
    main.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'instant'});
  }

  document.addEventListener('click', e=>{
    const openPopup=e.target.closest('[data-popup]');
    if (!openPopup) document.querySelectorAll('[data-popup][open]').forEach(x=>x.removeAttribute('open'));
  });
  document.addEventListener('keydown', e=>{if(e.key==='Escape')document.querySelectorAll('[data-popup][open]').forEach(x=>x.removeAttribute('open'))});
  document.querySelector('[data-back]').addEventListener('click',()=>history.back());
  document.querySelector('[data-help]').addEventListener('click',()=>{location.hash='#/about'});
  const dialog=document.querySelector('[data-search-dialog]');
  document.querySelector('[data-search-open]').addEventListener('click',()=>{dialog.showModal();setTimeout(()=>document.getElementById('global-search').focus(),0)});
  dialog.querySelector('[data-search-submit]').addEventListener('click',e=>{e.preventDefault();const q=document.getElementById('global-search').value.trim();dialog.close();location.hash=`#/search${q?`?q=${encodeURIComponent(q)}`:''}`});
  window.addEventListener('hashchange',route);
  setInterval(()=>{document.querySelector('[data-clock]').textContent=new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit'}).format(new Date())},1000);

  Promise.all([fetchArticles(), fetchGreeting()]).then(([articles,greeting])=>{
    state.articles=articles; state.greeting=greeting; state.ready=true; route();
  }).catch(error=>{state.error=error;state.ready=true;renderError(error?.message||'不明なエラー');});
})();
