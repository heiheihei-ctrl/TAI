'use client'

import type { Mark } from './types'
import { ArrowRight, Circle, Eraser, LassoSelect, Pencil, Square, Type } from 'lucide-react'

export const LIVE_CARD_W = 300
export const LIVE_CARD_H = 205

export const IMAGE = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bc2e9e20fee4507c6a51a6a02a4d5b87-KJLTkmAZa9rsR08ddWpkUn23tB5wvk.png'

export const drawTools = [
  { id: 'pen', label: '画笔', icon: Pencil }, { id: 'lasso', label: '套索', icon: LassoSelect },
  { id: 'rect', label: '矩形', icon: Square }, { id: 'circle', label: '圆形', icon: Circle },
  { id: 'arrow', label: '箭头', icon: ArrowRight },
]
export const editorTools = [...drawTools, { id: 'text', label: '文字', icon: Type }, { id: 'eraser', label: '橡皮', icon: Eraser }]
export const models = ['Analysis', 'Nano banana', 'GPT-Image-2', 'Seedream 5.0 Pro', 'Seedance']
export const colors = ['#ff4d55', '#1769ff', '#16a36a', '#f5a524', '#171c28']
export const houseModels = [
  { id: 'banana-pro', name: 'Nano banana Pro', cost: 1, kind: 'image' }, { id: 'banana-ultra', name: 'Nano banana Ultra', cost: 2, kind: 'image' },
  { id: 'gpt-image-2', name: 'GPT-image-2', cost: 1, kind: 'image' }, { id: 'seedream', name: 'Seedream 5.0Pro', cost: 2, tag: 'new', kind: 'image' },
  { id: 'seedance', name: 'Seedance', cost: 3, tag: 'new', kind: 'video' },
]
export const paidModels = [
  { id: 'midjourney', name: 'Midjourney', cost: 4, kind: 'image' }, { id: 'niji', name: 'Niji', cost: 4, kind: 'image' },
  { id: 'kling', name: 'Kling', cost: 5, kind: 'video', variants: ['Kling 3.0-Omni', 'Kling 2.5 Pro'] },
  { id: 'wan', name: 'Wan', cost: 3, kind: 'video' }, { id: 'happyhorse', name: 'HappyHorse', cost: 3, kind: 'video' },
  { id: 'other', name: '其它', cost: 0, kind: '' },
]
export const templateGroups = [
  { id: 'all', name: '全部', items: ['建筑外观概念','室内氛围渲染','材质细节特写','总平面鸟瞰','体块分析图','区域规划图','建筑功能分析图','智慧城市分析图','透视分析图','道路交通分析图','展板排版-竞赛风','景观节点透视'] },
  { id: 'cad', name: 'cad_总平_鸟瞰转化', items: ['cad-总平上色','cad-总平_日景鸟瞰','cad-总平_黄昏鸟瞰','总平面-彩色分析','总平面-景观铺装','鸟瞰-城市街区','鸟瞰-园区总览','鸟瞰-住区总览'] },
  { id: 'indoor', name: '室内专项', items: ['室内-客厅氛围','室内-卧室柔光','室内-办公空间','室内-商业展陈','室内-餐饮氛围','室内-材质特写','室内-灯光夜景','室内-软装配色'] },
  { id: 'board', name: '展板设计', items: ['展板-竞赛风排版','展板-极简网格','展板-分析图组合','展板-封面主视觉','展板-图纸拼版','展板-配色方案'] },
  { id: 'analysis', name: '建筑_规划分析图', items: ['体块分析图','区域规划图','建筑功能分析图','智慧城市分析图','爆炸分析图','营销ppt概念展示','透视分析图','道路交通分析图','建筑-分析图-2.5D轴测','建筑-分析图-sasaki分析','建筑-分析图-工程图','建筑-分析图-文脉分析','建筑-分析图-日照分析','建筑-分析图-空间节点','建筑-分析图-结构节点','建筑-分析图-结构讲解图','建筑-分析图-绿建分析','建筑-分析图-轴测交通流线','建筑-分析图-轴测投影','建筑-分析图-风环境分析','建筑-区域规划建筑特征','建筑-城市肌理分析图','建筑-城市规划-竞赛风','建筑-手工模型实景图','建筑-色调分析色卡','建筑-街道改造-问题现状'] },
  { id: 'arch', name: '建筑相关', items: ['建筑-外观日景','建筑-外观黄昏','建筑-立面细部','建筑-剖透视','建筑-概念草图','建筑-模型渲染','建筑-夜景照明','建筑-人视街景'] },
  { id: 'landscape', name: '景观相关', items: ['景观-节点透视','景观-总平上色','景观-剖面图','景观-植物配置','景观-水景设计','景观-铺装大样','景观-夜景氛围'] },
]

export const OP_LABELS: Record<string, string> = { newVariant: '新方案', img2img: '迭代', inpaint: '局部重绘', video: '视频' }

export const MOTION_PRESETS = [
  { id: 'orbit-left', label: '左环绕', desc: '建筑左方环绕一周' },
  { id: 'orbit-right', label: '右环绕', desc: '建筑右方环绕一周' },
  { id: 'orbit-top', label: '俯视环绕', desc: '高处俯瞰逐渐落下' },
  { id: 'push-in', label: '推近', desc: '镜头缓缓推近建筑' },
  { id: 'pull-out', label: '拉远', desc: '拉远展示周边环境' },
  { id: 'dolly-zoom', label: '推拉变焦', desc: '电影级戏剧透视变化' },
  { id: 'crane-up', label: '升轨', desc: '垂直上升展示全貌' },
  { id: 'fly-through', label: '穿行', desc: '穿越建筑内部沉浸式' },
  { id: 'pan-left', label: '左平移', desc: '水平左移展示立面' },
  { id: 'pan-right', label: '右平移', desc: '水平右移展示立面' },
  { id: 'static-timelapse', label: '固定延时', desc: '固定机位光影流转' },
]
