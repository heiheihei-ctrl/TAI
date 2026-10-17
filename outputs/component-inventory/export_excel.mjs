import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Workbook, SpreadsheetFile} from '@oai/artifact-tool';

const dir=path.dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(await fs.readFile(path.join(dir,'core-components.json'),'utf8'));
const html=await fs.readFile(path.join(dir,'Tanva-开源及第三方组件清单.html'),'utf8');
const notes=[
 '说明：本表选列项目核心第三方及开源组件，名称采用库或产品的常用名称。同一库的子组件及辅助依赖不逐项展开；开发、编译、类型声明等工具不列入。版本依据当前 npm 锁文件，不包含 tgAgent。',
 'SDK 的开源许可与云服务合同分别适用；表中许可不代表已取得云服务、模型或商业软件授权。IMG.LY 抠图库采用 AGPL v3。WebAV 当前上游为 MIT，但 1.2.8 包内未声明许可，保留版本许可核验说明。',
 '核对日期：2026 年 10 月 16 日。精确包名、原始版本及代码引用位置保留在 component-evidence.json，供技术核查使用。',
];
const wb=Workbook.create();
const sheet=wb.worksheets.add('核心组件清单');
sheet.showGridLines=false;
sheet.getRange('A1:D36').format.font={name:'Microsoft YaHei',size:11,color:'#111111'};
sheet.getRange('A1:D36').format.verticalAlignment='center';
sheet.getRange('A1:D1').merge();
sheet.getRange('A1').values=[['表 6-3  开源及第三方组件清单']];
sheet.getRange('A1:D1').format.font={name:'Microsoft YaHei',size:16,bold:true,color:'#000000'};
sheet.getRange('A1:D1').format.horizontalAlignment='center';
sheet.getRange('A1:D1').format.rowHeight=34;
sheet.getRange('A2:D2').format.rowHeight=12;
sheet.getRange('A3:D3').values=[['名称及版本','来源/提供方','许可协议/授权方式','在本作品中的用途']];
const matrix=data.rows.map(([name,version,provider,license,purpose])=>[`${name}\n${version}`,provider,license,purpose]);
sheet.getRange('A4:D31').values=matrix;
sheet.getRange('A3:D31').format.wrapText=true;
sheet.getRange('A3:D31').format.borders={preset:'all',style:'thin',color:'#707070'};
sheet.getRange('A3:D3').format.fill='#DCE6EE';
sheet.getRange('A3:D3').format.font={name:'Microsoft YaHei',size:11,bold:true,color:'#000000'};
sheet.getRange('A3:D3').format.rowHeight=32;
sheet.getRange('A3:D3').format.horizontalAlignment='left';
for (const [col,width] of [['A',35],['B',34],['C',33],['D',67]]) sheet.getRange(`${col}1:${col}36`).format.columnWidth=width;
sheet.getRange('A4:D31').format.rowHeight=54;
sheet.getRange('A13:D13').format.rowHeight=68;
sheet.getRange('A21:D21').format.rowHeight=68;
for(let i=0;i<notes.length;i++){
 const row=33+i;
 sheet.getRange(`A${row}:D${row}`).merge();
 sheet.getRange(`A${row}`).values=[[notes[i]]];
 sheet.getRange(`A${row}:D${row}`).format.wrapText=true;
 sheet.getRange(`A${row}:D${row}`).format.font={name:'Microsoft YaHei',size:10,color:'#555555'};
 sheet.getRange(`A${row}:D${row}`).format.rowHeight=i===2?32:48;
}
sheet.freezePanes.freezeRows(3);
wb.recalculate();
const values=sheet.getRange('A4:D31').values;
if(JSON.stringify(values)!==JSON.stringify(matrix))throw new Error('Export data mismatch');
console.log((await wb.inspect({kind:'table',range:'核心组件清单!A17:D19',include:'values',tableMaxRows:3,tableMaxCols:4,maxChars:1500})).ndjson);
for(const [name,range] of [['excel-top','A1:D10'],['excel-moderation','A14:D21'],['excel-bottom','A26:D35']]){
 const image=await wb.render({sheetName:sheet.name,range,scale:1.5,format:'png'});
 await fs.writeFile(path.join(dir,'qa',name+'.png'),new Uint8Array(await image.arrayBuffer()));
}
const output=await SpreadsheetFile.exportXlsx(wb);
await output.save(path.join(dir,'Tanva-开源及第三方组件清单.xlsx'));
console.log('Saved XLSX with '+matrix.length+' component rows.');
