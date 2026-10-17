const {createRequire}=require('module');
const {pathToFileURL}=require('url');
const path=require('path');
const runtimeRequire=createRequire('C:/Users/27881/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=runtimeRequire('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1230,height:950},deviceScaleFactor:1});
 await page.goto(pathToFileURL(path.resolve(__dirname,'Tanva-开源及第三方组件清单.html')).href);
 await page.screenshot({path:path.resolve(__dirname,'qa/top.png')});
 const rows=page.locator('tbody tr');
 for(const [label,index] of [['imgly',10],['moderation',15],['last',27]]) {
  await rows.nth(index).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.resolve(__dirname,'qa/'+label+'.png')});
 }
 console.log(JSON.stringify({rows:await rows.count(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),title:await page.title()}));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
