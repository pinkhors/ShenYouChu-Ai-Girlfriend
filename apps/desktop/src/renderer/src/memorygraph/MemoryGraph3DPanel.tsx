import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import {
  ApiError,
  fetchMemoryChunk,
  fetchMemoryGraph,
  forgetMemoryChunk,
  rebuildMemoryGraph,
  type MemoryChunkDetail,
  type MemoryGraphNode,
  type MemoryGraphView
} from '../api/client'
import Icon from '../ui/Icon'
import { formatTime } from '../ui/time'
import './MemoryGraph3DPanel.css'

/**
 * 3D 星链（新增模式，不替换 2D）。
 *
 * 不引入 WebGL 依赖：用透视投影把同一份快照画到 SVG。
 * 世界坐标：XZ = 时间角度 + 重要度半径，Y = 记忆类型分层。
 * 交互：左键拖拽旋转、右键/Shift 拖拽平移、滚轮缩放、双击聚焦、Esc 回全景。
 */

interface MemoryGraph3DPanelProps {
  readonly characterId: string | null
  readonly characterName: string
  readonly onOpenConversation?: (conversationId: string) => void
}

type NodeCategory = 'habit' | 'promise' | 'fact' | 'episode'

interface Camera {
  readonly yaw: number
  readonly pitch: number
  readonly zoom: number
  readonly panX: number
  readonly panY: number
}

interface Point3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

interface Projected {
  readonly x: number
  readonly y: number
  readonly depth: number
  readonly scale: number
}

const CENTER_X = 450
const CENTER_Y = 350
const LAYER_SCALE = 150
const LAYER_Y: Record<NodeCategory, number> = {
  habit: 1.35,
  fact: 0.78,
  promise: 0.16,
  episode: -0.62
}
const CATEGORY_LABELS: Record<NodeCategory, string> = {
  habit: '她学到的',
  fact: '关于你',
  promise: '你们的约定',
  episode: '一起经历'
}
const CATEGORY_ORDER: readonly NodeCategory[] = ['habit', 'fact', 'promise', 'episode']
const MIN_ZOOM = 0.65
const MAX_ZOOM = 2.4
const MIN_PITCH = -1.1
const MAX_PITCH = 1.1
const HOME_CAMERA: Camera = { yaw: -0.55, pitch: 0.28, zoom: 0.85, panX: 0, panY: 0 }

function readCategory(value: string): NodeCategory {
  switch (value.trim().toLowerCase()) {
    case 'habit':
    case 'habits':
      return 'habit'
    case 'promise':
    case 'promises':
      return 'promise'
    case 'fact':
    case 'facts':
      return 'fact'
    default:
      return 'episode'
  }
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function project(point: Point3, camera: Camera): Projected {
  const cosYaw = Math.cos(camera.yaw)
  const sinYaw = Math.sin(camera.yaw)
  const x1 = point.x * cosYaw - point.z * sinYaw
  const z1 = point.x * sinYaw + point.z * cosYaw
  const cosPitch = Math.cos(camera.pitch)
  const sinPitch = Math.sin(camera.pitch)
  const y1 = point.y * cosPitch - z1 * sinPitch
  const z2 = point.y * sinPitch + z1 * cosPitch
  const scale = camera.zoom * 900 / Math.max(240, 900 + z2)
  return {
    x: CENTER_X + x1 * scale + camera.panX,
    y: CENTER_Y + y1 * scale + camera.panY,
    depth: z2,
    scale
  }
}

function nodePoint(node: MemoryGraphNode): Point3 {
  const category = readCategory(node.category)
  const angle = (node.angle * Math.PI) / 180
  return {
    x: Math.cos(angle) * node.radius,
    y: LAYER_Y[category] * LAYER_SCALE,
    z: Math.sin(angle) * node.radius
  }
}

function constellationPoint(angle: number, radius: number, category: string): Point3 {
  const radians = (angle * Math.PI) / 180
  return {
    x: Math.cos(radians) * radius,
    y: LAYER_Y[readCategory(category)] * LAYER_SCALE,
    z: Math.sin(radians) * radius
  }
}

function nodeRadius(importance: number): number {
  const value = Number.isFinite(importance) ? clamp(importance, 0, 1) : 0.4
  return 5 + 11 * value
}

function layerRing(category: NodeCategory, radius: number, camera: Camera): string {
  const points: string[] = []
  for (let index = 0; index < 48; index++) {
    const angle = (index / 48) * Math.PI * 2
    const projected = project(
      { x: Math.cos(angle) * radius, y: LAYER_Y[category] * LAYER_SCALE, z: Math.sin(angle) * radius },
      camera
    )
    points.push(`${index === 0 ? 'M' : 'L'}${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`)
  }
  return `${points.join(' ')} Z`
}

export default function MemoryGraph3DPanel({
  characterId,
  characterName,
  onOpenConversation
}: MemoryGraph3DPanelProps): ReactElement {
  const [graph, setGraph] = useState<MemoryGraphView | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<MemoryGraphNode | null>(null)
  const [detail, setDetail] = useState<MemoryChunkDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isForgetting, setIsForgetting] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [camera, setCamera] = useState<Camera>(HOME_CAMERA)
  const requestRef = useRef(0)
  const detailRequestRef = useRef(0)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    camera: Camera
    mode: 'rotate' | 'pan'
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)

  const loadGraph = useCallback(async (): Promise<void> => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setIsLoading(true)
    setError(null)
    try {
      const view = await fetchMemoryGraph(characterId ?? undefined)
      if (requestRef.current !== requestId) {
        return
      }
      if (characterId !== null && view.characterId !== characterId) {
        setError('星图与当前角色不一致，请重试。')
        return
      }
      setGraph(view)
    } catch (loadError: unknown) {
      if (requestRef.current === requestId) {
        setError(toMessage(loadError))
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [characterId])

  useEffect(() => {
    detailRequestRef.current += 1
    setSelectedNode(null)
    setDetail(null)
    setDetailError(null)
    setCamera(HOME_CAMERA)
    void loadGraph()
  }, [loadGraph])

  const selectNode = useCallback((node: MemoryGraphNode): void => {
    const requestId = detailRequestRef.current + 1
    detailRequestRef.current = requestId
    setSelectedNode(node)
    setDetail(null)
    setDetailError(null)
    setIsDetailLoading(true)
    void fetchMemoryChunk(node.chunkId)
      .then((chunk) => {
        if (detailRequestRef.current === requestId) {
          setDetail(chunk)
        }
      })
      .catch((detailLoadError: unknown) => {
        if (detailRequestRef.current === requestId) {
          setDetailError(toMessage(detailLoadError))
        }
      })
      .finally(() => {
        if (detailRequestRef.current === requestId) {
          setIsDetailLoading(false)
        }
      })
  }, [])

  const clearSelection = useCallback((): void => {
    detailRequestRef.current += 1
    setSelectedNode(null)
    setDetail(null)
    setDetailError(null)
    setIsDetailLoading(false)
  }, [])

  const rebuild = useCallback(async (): Promise<void> => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setIsRebuilding(true)
    setError(null)
    try {
      const view = await rebuildMemoryGraph(characterId ?? undefined)
      if (requestRef.current !== requestId) {
        return
      }
      setGraph(view)
      clearSelection()
    } catch (rebuildError: unknown) {
      if (requestRef.current === requestId) {
        setError(toMessage(rebuildError))
      }
    } finally {
      setIsRebuilding(false)
      setIsLoading(false)
    }
  }, [characterId, clearSelection])

  const forgetSelected = useCallback(async (): Promise<void> => {
    if (selectedNode === null) {
      return
    }
    if (!window.confirm('忘记这条记忆后，她将不再记得这件事。确定忘记吗？')) {
      return
    }
    setIsForgetting(true)
    setDetailError(null)
    try {
      await forgetMemoryChunk(selectedNode.chunkId)
      clearSelection()
      await loadGraph()
    } catch (forgetError: unknown) {
      setDetailError(toMessage(forgetError))
    } finally {
      setIsForgetting(false)
    }
  }, [clearSelection, loadGraph, selectedNode])

  useEffect(() => {
    const element = svgRef.current
    if (element === null) {
      return
    }
    const handleWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) {
        return
      }
      event.preventDefault()
      setCamera((previous) => ({
        ...previous,
        zoom: clamp(previous.zoom * (event.deltaY < 0 ? 1.1 : 0.9), MIN_ZOOM, MAX_ZOOM)
      }))
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', handleWheel)
    }
  }, [])

  const positions = useMemo(() => {
    const map = new Map<string, Projected>()
    if (graph === null) {
      return map
    }
    for (const constellation of graph.constellations) {
      const point = constellationPoint(constellation.angle, constellation.radius, constellation.kind)
      map.set(constellation.id, project(point, camera))
    }
    for (const node of graph.nodes) {
      map.set(node.id, project(nodePoint(node), camera))
    }
    return map
  }, [camera, graph])

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>()
    if (graph === null) {
      return map
    }
    const link = (source: string, target: string): void => {
      const existing = map.get(source)
      if (existing === undefined) {
        map.set(source, new Set([target]))
      } else {
        existing.add(target)
      }
    }
    for (const edge of graph.edges) {
      if (edge.kind === 'ownership') {
        continue
      }
      link(edge.source, edge.target)
      link(edge.target, edge.source)
    }
    return map
  }, [graph])

  const hoveredNode = graph?.nodes.find((node) => node.id === hoveredId) ?? null
  const highlightActive = hoveredNode !== null && !hoveredNode.ghost
  const highlightedNeighbors = highlightActive && hoveredNode !== null
    ? neighbors.get(hoveredNode.id) ?? new Set<string>()
    : new Set<string>()

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      camera,
      mode: event.button === 2 || event.shiftKey ? 'pan' : 'rotate',
      moved: false
    }
    suppressClickRef.current = false
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current
    if (drag === null) {
      return
    }
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      drag.moved = true
      suppressClickRef.current = true
    }
    if (drag.mode === 'pan') {
      setCamera({ ...drag.camera, panX: drag.camera.panX + dx, panY: drag.camera.panY + dy })
      return
    }
    setCamera({
      ...drag.camera,
      yaw: drag.camera.yaw + dx * 0.008,
      pitch: clamp(drag.camera.pitch + dy * 0.006, MIN_PITCH, MAX_PITCH)
    })
  }

  const endDrag = (): void => {
    dragRef.current = null
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 60)
  }

  const resetCamera = (): void => {
    setCamera(HOME_CAMERA)
  }

  const focusNode = (node: MemoryGraphNode): void => {
    const projected = positions.get(node.id)
    if (projected === undefined) {
      return
    }
    setCamera((previous) => ({
      ...previous,
      panX: previous.panX + (CENTER_X - projected.x),
      panY: previous.panY + (CENTER_Y - projected.y)
    }))
  }

  const visibleGraph = graph !== null && (characterId === null || graph.characterId === characterId) ? graph : null
  const nodeCount = visibleGraph?.nodes.length ?? 0
  const selectedDate = detail !== null ? detail.createdAt : selectedNode?.createdAt ?? null
  const selectedCategory = detail !== null ? detail.category : selectedNode?.category ?? ''
  const sourceConversationId = detail !== null && detail.conversationId !== ''
    ? detail.conversationId
    : selectedNode?.conversationId ?? null
  const isForgotten = selectedNode?.ghost === true || (detail !== null && detail.invalidAt !== null)

  return (
    <section className="mg3" aria-label="3D 星链">
      <header className="mg3-toolbar">
        <div>
          <h2 className="mg3-title">3D 星链</h2>
          <p className="mg3-meta">
            {visibleGraph !== null
              ? `第 ${visibleGraph.version} 版 · ${formatTime(visibleGraph.generatedAt)} 生成`
              : isLoading
                ? '正在展开…'
                : '尚未展开'}
          </p>
        </div>
        <div className="mg3-actions">
          <span className="mg3-hint">拖拽旋转 · 右键平移 · 滚轮缩放</span>
          <button className="btn btn--ghost btn--sm" type="button" onClick={resetCamera}>
            回到全景
          </button>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={isRebuilding || isLoading}
            onClick={() => {
              void rebuild()
            }}
          >
            <Icon name="refresh" size={15} />
            {isRebuilding ? '整理中…' : '重新整理'}
          </button>
        </div>
      </header>

      {error !== null && (
        <div className="mg3-error">
          <p className="alert" role="alert">{error}</p>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => { void loadGraph() }}>
            重试
          </button>
        </div>
      )}

      {visibleGraph === null ? (
        <div className="mg3-state">
          {isLoading ? <p className="muted">正在展开 3D 星链…</p> : <p className="muted">还没有可以展开的星球。</p>}
        </div>
      ) : (
        <div className="mg3-body">
          <aside className="mg3-side" aria-label="3D 星链接侧栏">
            <p className="mg3-eyebrow">当前角色</p>
            <h3 className="mg3-character">{characterName.trim() === '' ? '她' : characterName}</h3>
            <dl className="mg3-stats">
              <div><dt>星球</dt><dd>{visibleGraph.stats.nodes}</dd></div>
              <div><dt>连线</dt><dd>{visibleGraph.stats.edges}</dd></div>
              <div><dt>幽灵</dt><dd>{visibleGraph.stats.ghosts}</dd></div>
            </dl>
            <div className="mg3-layers">
              {CATEGORY_ORDER.map((category) => (
                <span className="mg3-layer-chip" key={category}>
                  {CATEGORY_LABELS[category]}
                  <b>{visibleGraph.constellations.find((item) => readCategory(item.kind) === category)?.count ?? 0}</b>
                </span>
              ))}
            </div>
            <hr className="mg3-divider" />
            {selectedNode === null ? (
              <p className="mg3-hint-text">
                {nodeCount === 0 ? '还没有可以展开的星球。' : '点一颗星球，看看她记住了什么；双击把镜头拉近。'}
              </p>
            ) : (
              <div className="mg3-detail">
                <div className="mg3-detail-head">
                  <h4>{selectedNode.label}</h4>
                  <button className="mg3-back" type="button" onClick={clearSelection}>返回</button>
                </div>
                <p className="mg3-detail-meta">
                  <span>{formatTime(selectedDate)}</span>
                  <span className="mg3-tag">{CATEGORY_LABELS[readCategory(selectedCategory)]}</span>
                  {isForgotten && <span className="mg3-tag mg3-tag--ghost">已遗忘</span>}
                </p>
                {isDetailLoading && <p className="muted">正在读取…</p>}
                {detailError !== null && <p className="alert">{detailError}</p>}
                {detail !== null && (
                  <>
                    {detail.topics.length > 0 && (
                      <div className="mg3-field">
                        <p className="mg3-field-label">话题</p>
                        <div className="mg3-chips">
                          {detail.topics.map((topic) => <span className="mg3-chip" key={topic}>{topic}</span>)}
                        </div>
                      </div>
                    )}
                    <div className="mg3-field">
                      <p className="mg3-field-label">原文</p>
                      <div className="mg3-text" tabIndex={0}>{detail.content}</div>
                    </div>
                    <div className="mg3-detail-actions">
                      {!isForgotten && (
                        <button
                          className="btn btn--danger btn--sm"
                          type="button"
                          disabled={isForgetting}
                          onClick={() => { void forgetSelected() }}
                        >
                          <Icon name="trash" size={15} />
                          {isForgetting ? '忘记中…' : '忘记'}
                        </button>
                      )}
                      {sourceConversationId !== null && onOpenConversation !== undefined && (
                        <button
                          className="btn btn--ghost btn--sm"
                          type="button"
                          onClick={() => { onOpenConversation(sourceConversationId) }}
                        >
                          <Icon name="chat" size={15} />
                          查看原对话
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </aside>

          <div className="mg3-canvas">
            <svg
              ref={svgRef}
              className="mg3-svg"
              viewBox="0 0 900 700"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`${characterName}的 3D 星链，共 ${visibleGraph.stats.nodes} 颗星球`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onContextMenu={(event) => { event.preventDefault() }}
            >
              {CATEGORY_ORDER.map((category) => (
                <path
                  key={`ring-${category}`}
                  className="mg3-ring"
                  d={layerRing(category, 300, camera)}
                />
              ))}

              {visibleGraph.edges.map((edge) => {
                const from = positions.get(edge.source)
                const to = positions.get(edge.target)
                if (from === undefined || to === undefined) {
                  return null
                }
                const depth = (from.depth + to.depth) / 2
                const opacity = clamp(0.32 - Math.max(0, depth) / 2600, 0.07, 0.38)
                const active = highlightActive && hoveredNode !== null
                  && (edge.source === hoveredNode.id || edge.target === hoveredNode.id)
                return (
                  <line
                    key={edge.id}
                    className={`mg3-edge mg3-edge--${edge.kind}${active ? ' mg3-edge--active' : ''}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    opacity={active ? 0.85 : opacity}
                  />
                )
              })}

              {visibleGraph.constellations.map((constellation) => {
                const point = positions.get(constellation.id)
                if (point === undefined) {
                  return null
                }
                return (
                  <text
                    key={constellation.id}
                    className="mg3-constellation"
                    x={point.x}
                    y={point.y}
                    textAnchor="middle"
                    opacity={clamp(0.9 - point.depth / 2200, 0.3, 0.9)}
                  >
                    {constellation.label}
                  </text>
                )
              })}

              {visibleGraph.nodes.map((node) => {
                const point = positions.get(node.id)
                if (point === undefined) {
                  return null
                }
                const radius = nodeRadius(node.importance) * point.scale
                const isSelected = selectedNode?.id === node.id
                const isHovered = hoveredId === node.id && !node.ghost
                const dimmed = highlightActive && hoveredNode !== null
                  && node.id !== hoveredNode.id && !highlightedNeighbors.has(node.id)
                const opacity = node.ghost ? 0.38 : dimmed ? 0.22 : clamp(1 - point.depth / 4000, 0.55, 1)
                const category = readCategory(node.category)
                return (
                  <g
                    key={node.id}
                    className="mg3-node"
                    opacity={opacity}
                    onMouseEnter={() => { setHoveredId(node.id) }}
                    onMouseLeave={() => { setHoveredId(null) }}
                    onClick={() => {
                      if (suppressClickRef.current) {
                        return
                      }
                      selectNode(node)
                    }}
                    onDoubleClick={() => { focusNode(node) }}
                  >
                    <title>{`${node.label} · ${formatTime(node.createdAt)}${node.ghost ? ' · 已遗忘' : ''}`}</title>
                    <circle className="mg3-hit" cx={point.x} cy={point.y} r={Math.max(radius + 8, 16)} />
                    {isSelected && <circle className="mg3-selected" cx={point.x} cy={point.y} r={radius + 6} />}
                    {category === 'habit' ? (
                      <rect
                        className="mg3-shape mg3-shape--habit"
                        x={point.x - radius}
                        y={point.y - radius}
                        width={radius * 2}
                        height={radius * 2}
                        transform={`rotate(45 ${point.x} ${point.y})`}
                        opacity={isHovered ? 1 : 0.9}
                      />
                    ) : (
                      <circle
                        className={`mg3-shape mg3-shape--${category}${node.ghost ? ' mg3-shape--ghost' : ''}`}
                        cx={point.x}
                        cy={point.y}
                        r={radius}
                        opacity={isHovered ? 1 : 0.9}
                      />
                    )}
                    {category === 'promise' && (
                      <circle className="mg3-inner" cx={point.x} cy={point.y} r={radius * 0.55} />
                    )}
                  </g>
                )
              })}

              {hoveredNode !== null && (() => {
                const point = positions.get(hoveredNode.id)
                if (point === undefined) {
                  return null
                }
                return (
                  <text className="mg3-node-label" x={point.x + 10} y={point.y - 10}>
                    {hoveredNode.label}
                  </text>
                )
              })()}
            </svg>
            <p className="mg3-zoom">缩放 {Math.round(camera.zoom * 100)}%</p>
          </div>
        </div>
      )}
    </section>
  )
}
