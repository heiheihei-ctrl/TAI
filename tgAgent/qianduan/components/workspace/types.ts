export type Mark = {
  type: string
  color: string
  x1: number
  y1: number
  x2: number
  y2: number
  points?: string
  text?: string
  filled?: boolean
}

export type Node = {
  id: number
  type: string
  x: number
  y: number
}
