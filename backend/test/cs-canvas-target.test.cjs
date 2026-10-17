require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CsDeskService}=require('../src/cs-desk/cs-desk.service');
process.env.DEPLOYMENT_BRAND='linglong';

function setup() {
  const state={online:true,conversation:{id:'conversation',userId:'customer',agentId:'agent',status:'active'},collab:{projectId:'customer-project',status:'accepted',endedAt:null},project:{id:'customer-project',userId:'customer',teamId:null},agent:{id:'agent',role:'user',status:'active',isCsAgent:true}};
  const service=new CsDeskService({
    user:{findUnique:async({where})=>where.id==='agent'?state.agent:{id:'customer',name:'客户甲',phone:'13800000000',createdAt:new Date('2026-10-01T00:00:00Z'),creditAccount:{balance:1646}}},
    userMembershipSubscription:{findFirst:async()=>null},
    csConversation:{findUnique:async()=>state.conversation},
    csCollabRequest:{findFirst:async()=>state.collab},
    project:{findUnique:async()=>state.project},
  });
  service.setCanvasOnlineChecker((userId,projectId)=>state.online&&userId==='customer'&&projectId==='customer-project');
  return {state,service};
}

test('entry resolves the customer-owned authorized canvas, never the agent project',async()=>{
  const {service}=setup();
  const target=await service.getCanvasTarget('conversation','agent');
  assert.equal(target.projectId,'customer-project');
  assert.equal(target.conversationId,'conversation');
  assert.equal(target.customer.id,'customer');
  assert.equal(target.customer.creditBalance,1646);
  assert.equal(target.startedAt,null);
});

test('entry preserves consent start time across reloads',async()=>{
  const {service,state}=setup();
  state.collab.id='request';
  state.collab.startedAt=new Date('2026-10-17T01:32:00Z');
  const first=await service.getCanvasTarget('conversation','agent');
  const second=await service.getCanvasTarget('conversation','agent');
  assert.equal(first.startedAt,'2026-10-17T01:32:00.000Z');
  assert.equal(second.startedAt,first.startedAt);
  assert.equal(first.collabId,'request');
});

test('ending collaboration restricts the assigned active agent and emits an ended response',async()=>{
  const {service}=setup();
  let count=1;
  const messages=[];
  service.prisma.csCollabRequest.updateMany=async({where,data})=>{
    assert.deepEqual(where,{id:'request',conversationId:'conversation',agentId:'agent',status:'accepted',endedAt:null,conversation:{status:'active',agentId:'agent'}});
    assert.equal(data.status,'ended');
    assert.ok(data.endedAt instanceof Date);
    return {count};
  };
  service.postMessage=async(message)=>messages.push(message);
  assert.deepEqual(await service.endCollab('conversation','request','agent'),{ok:true});
  assert.equal(messages[0].content.status,'ended');
  assert.equal(messages[0].content.collabId,'request');
  count=0;
  await assert.rejects(service.endCollab('conversation','request','agent'));
  assert.equal(messages.length,1);
});

test('offline customer produces a prompt rather than a fallback project',async()=>{
  const {service,state}=setup();state.online=false;
  await assert.rejects(service.getCanvasTarget('conversation','agent'),/对方不在线/);
});

test('entry rejects ended/transferred sessions, missing consent and foreign projects',async()=>{
  for(const mutate of [
    s=>{s.conversation.status='ended'},
    s=>{s.conversation.agentId='another-agent'},
    s=>{s.collab.status='pending'},
    s=>{s.collab.endedAt=new Date()},
    s=>{s.project.userId='agent'},
    s=>{s.project.teamId='team'},
    s=>{s.agent.isCsAgent=false},
  ]){
    const {service,state}=setup();mutate(state);
    await assert.rejects(service.getCanvasTarget('conversation','agent'));
  }
});

test('websocket presence is scoped to an owned open personal canvas and clears on leaving',async()=>{
  const {CsWsGateway}=require('../src/cs-desk/cs-ws.gateway');
  let checker;
  const gateway=new CsWsGateway({}, {project:{findUnique:async({where})=>({userId:where.id==='owned'?'customer':'agent',teamId:null})}}, {
    setCanvasOnlineChecker:fn=>{checker=fn},setBroadcaster:()=>{},
  });
  gateway.onModuleInit();
  const conn={userId:'customer',ws:{readyState:1,send:()=>{},close:()=>{}},canvasProjectId:null,canvasPresenceVersion:0,rooms:new Set()};
  gateway.conns.add(conn);
  try{
    await gateway.onMessage(conn,Buffer.from(JSON.stringify({type:'canvas_presence',projectId:'owned'})));
    assert.equal(checker('customer','owned'),true);
    assert.equal(checker('agent','owned'),false);
    await gateway.onMessage(conn,Buffer.from(JSON.stringify({type:'canvas_presence',projectId:'foreign'})));
    assert.equal(checker('customer','owned'),false);
    await gateway.onMessage(conn,Buffer.from(JSON.stringify({type:'canvas_presence',projectId:'owned'})));
    await gateway.onMessage(conn,Buffer.from(JSON.stringify({type:'canvas_presence',projectId:null})));
    assert.equal(checker('customer','owned'),false);
  }finally{gateway.onModuleDestroy()}
});

test('CS cursors travel both ways only on the authorized active canvas',async()=>{
  const {CsWsGateway}=require('../src/cs-desk/cs-ws.gateway');
  const collab={status:'accepted',endedAt:null,agentId:'agent',conversation:{userId:'customer',agentId:'agent',user:{name:'客户'},agent:{name:'客服',isCsAgent:true}}};
  const gateway=new CsWsGateway({}, {csCollabRequest:{findFirst:async({where})=>{
    assert.equal(where.projectId,'owned');
    assert.equal(where.conversation.status,'active');
    return collab;
  }}}, {});
  const received=[];
  const peer=(id)=>({userId:id,isAgent:id==='agent',canvasProjectId:'owned',ws:{readyState:1,send:raw=>received.push({id,event:JSON.parse(raw)})}});
  const customer=peer('customer'),agent=peer('agent'),stranger=peer('stranger');
  for(const conn of [customer,agent,stranger]) gateway.conns.add(conn);
  const send=(conn,extra={})=>gateway.onMessage(conn,Buffer.from(JSON.stringify({type:'canvas_cursor',projectId:'owned',x:10,y:20,...extra})));
  await send(customer);
  assert.deepEqual(received.map(item=>item.id),['agent']);
  assert.equal(received[0].event.name,'客户');
  received.length=0;
  await send(agent);
  assert.deepEqual(received.map(item=>item.id),['customer']);
  received.length=0;
  await send(customer,{projectId:'foreign'});
  await send(customer,{x:null});
  assert.equal(received.length,0);
  for(const mutate of [()=>{collab.status='pending'},()=>{collab.status='accepted';collab.endedAt=new Date()},()=>{collab.endedAt=null;collab.conversation.agentId='other'}]) {
    mutate(); await send(customer); assert.equal(received.length,0);
  }
});
