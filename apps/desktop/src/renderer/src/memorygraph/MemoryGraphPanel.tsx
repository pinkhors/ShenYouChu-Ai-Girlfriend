import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
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
import './MemoryGraphPanel.css'

/**
 * 记忆星图 v0（只读投影）。
 *
 * 布局由后端快照给定，前端不跑力导向：极坐标公式固定为
 * x = 450 + radius * cos(angle * PI / 180)，y = 350 + radius * sin(angle * PI / 180)。
 * 滚轮缩放只改 <g> 的 transform，不重算节点坐标。
 */

interface MemoryGraphPanelProps {
  readonly characterId: string | null
  readonly characterName: string
  readonly onOpenConversation?: (conversationId: string) => void
}

interface StarCanvasProps {
  readonly graph: MemoryGraphView
  readonly characterName: string
  readonly selectedNodeId: string | null
  readonly scale: number
  readonly onSelectNode: (node: MemoryGraphNode) => void
  readonly onZoomStep: (direction: ZoomDirection) => void
}

type ZoomDirection = 1 | -1
type NodeCategory = 'habit' | 'promise' | 'fact' | 'episode'

interface Point {
  readonly x: number
  readonly y: number
}

const VIEW_BOX_WIDTH = 900
const VIEW_BOX_HEIGHT = 700
const CENTER_X = 450
const CENTER_Y = 350
const MIN_SCALE = 0.8
const MAX_SCALE = 1.6
const HOVER_SCALE = 1.08
const MIN_NODE_RADIUS = 8
const MAX_NODE_RADIUS = 18
const GHOST_OPACITY = 0.4
const DIMMED_OPACITY = 0.25
const EMPTY_NEIGHBORS: ReadonlySet<string> = new Set<string>()

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  fact: '事实',
  promise: '约定',
  episode: '经历',
  habit: '习惯'
}

const MODE_LABELS: Record<MemoryGraphView['mode'], string> = {
  incremental: '增量更新',
  nightly: '夜间校准'
}

/** 后端可能给单数（fact）或星座复数（facts），统一收窄成四种形状。 */
function readCategory(value: string): NodeCategory | null {
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
    case 'episode':
    case 'episodes':
      return 'episode'
    default:
      return null
  }
}

function categoryLabel(value: string): string {
  const category = readCategory(value)
  return category === null ? '记忆' : CATEGORY_LABELS[category]
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

function polarPoint(angle: number, radius: number): Point {
  const radians = (angle * Math.PI) / 180
  return {
    x: CENTER_X + radius * Math.cos(radians),
    y: CENTER_Y + radius * Math.sin(radians)
  }
}

function nodeRadius(importance: number): number {
  const normalized = Number.isFinite(importance) ? Math.min(1, Math.max(0, importance)) : 0.4
  return MIN_NODE_RADIUS + (MAX_NODE_RADIUS - MIN_NODE_RADIUS) * normalized
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

function NodeShape({ category, radius }: { readonly category: string; readonly radius: number }): ReactElement {
  const shape = readCategory(category) ?? 'episode'
  if (shape === 'habit') {
    const points = `0 ${-radius} ${radius} 0 0 ${radius} ${-radius} 0`
    return <polygon className="mg-node__shape mg-node__shape--habit" points={points} />
  }
  if (shape === 'promise') {
    return (
      <>
        <circle className="mg-node__shape mg-node__shape--promise" r={radius} />
        <circle className="mg-node__inner-ring" r={radius * 0.55} />
      </>
    )
  }
  if (shape === 'fact') {
    return <circle className="mg-node__shape mg-node__shape--fact" r={radius} />
  }
  return <circle className="mg-node__shape mg-node__shape--episode" r={radius * 0.8} />
}

function EmptyState(): ReactElement {
  return (
    <div className="mg-empty">
      <span className="mg-empty__icon" aria-hidden="true">
        <Icon name="sparkles" size={26} />
      </span>
      <p className="mg-empty__title">还没有星链</p>
      <p className="mg-empty__text">聊过之后，星链才会连起来</p>
    </div>
  )
}

function GraphLegend(): ReactElement {
  return (
    <div className="mg-legend" role="note" aria-label="图例">
      <span className="mg-legend__item">
        <span className="mg-legend__swatch mg-legend__swatch--ownership" aria-hidden="true" />
        归属
      </span>
      <span className="mg-legend__item">
        <span className="mg-legend__swatch mg-legend__swatch--semantic" aria-hidden="true" />
        语义
      </span>
      <span className="mg-legend__item">
        <span className="mg-legend__swatch mg-legend__swatch--temporal" aria-hidden="true" />
        时间
      </span>
    </div>
  )
}

function StarCanvas({
  graph,
  characterName,
  selectedNodeId,
  scale,
  onSelectNode,
  onZoomStep
}: StarCanvasProps): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  useEffect(() => {
    setHoveredNodeId(null)
  }, [graph])

  // React 的 onWheel 在根节点上是 passive 的，无法 preventDefault；这里挂原生监听避免页面跟着滚。
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
      onZoomStep(event.deltaY < 0 ? 1 : -1)
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', handleWheel)
    }
  }, [onZoomStep])

  const positions = useMemo(() => {
    const map = new Map<string, Point>()
    for (const constellation of graph.constellations) {
      map.set(constellation.id, polarPoint(constellation.angle, constellation.radius))
    }
    for (const node of graph.nodes) {
      map.set(node.id, polarPoint(node.angle, node.radius))
    }
    return map
  }, [graph])

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const link = (source: string, target: string): void => {
      const existing = map.get(source)
      if (existing === undefined) {
        map.set(source, new Set<string>([target]))
        return
      }
      existing.add(target)
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

  const hoveredNode = useMemo(() => {
    if (hoveredNodeId === null) {
      return null
    }
    return graph.nodes.find((node) => node.id === hoveredNodeId) ?? null
  }, [graph.nodes, hoveredNodeId])

  // 幽灵星按设计不参与 hover 高亮，只保留 tooltip。
  const highlightActive = hoveredNode !== null && !hoveredNode.ghost
  const highlightedNeighbors: ReadonlySet<string> =
    highlightActive && hoveredNode !== null ? neighbors.get(hoveredNode.id) ?? EMPTY_NEIGHBORS : EMPTY_NEIGHBORS

  return (
    <svg
      ref={svgRef}
      className="mg-canvas__svg"
      viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${characterName}的记忆星链，共 ${graph.stats.nodes} 颗星球、${graph.stats.edges} 条连线`}
    >
      <g transform={`translate(${CENTER_X} ${CENTER_Y}) scale(${scale}) translate(${-CENTER_X} ${-CENTER_Y})`}>
        <g>
          {graph.edges.map((edge) => {
            const from = positions.get(edge.source)
            const to = positions.get(edge.target)
            if (from === undefined || to === undefined) {
              return null
            }
            const connected =
              highlightActive && hoveredNode !== null && (edge.source === hoveredNode.id || edge.target === hoveredNode.id)
            const classes = ['mg-edge', `mg-edge--${edge.kind}`]
            if (connected) {
              classes.push('mg-edge--active')
            } else if (highlightActive) {
              classes.push('mg-edge--dim')
            }
            return (
              <line
                key={edge.id}
                className={classes.join(' ')}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                strokeLinecap="round"
              />
            )
          })}
        </g>

        <g>
          {graph.constellations.map((constellation) => {
            const point = positions.get(constellation.id)
            if (point === undefined) {
              return null
            }
            const label = constellation.label === '' ? '未命名星座' : constellation.label
            return (
              <g key={constellation.id}>
                <text className="mg-map-label" x={point.x} y={point.y - 6} textAnchor="middle">
                  {label}
                </text>
                <rect
                  className="mg-map-pill"
                  x={point.x - 13}
                  y={point.y + 2}
                  width={26}
                  height={18}
                  rx={9}
                />
                <text className="mg-map-count" x={point.x} y={point.y + 15} textAnchor="middle">
                  {constellation.count}
                </text>
              </g>
            )
          })}
        </g>

        <g>
          {graph.nodes.map((node) => {
            const point = positions.get(node.id)
            if (point === undefined) {
              return null
            }
            const radius = nodeRadius(node.importance)
            const isSelected = selectedNodeId === node.chunkId
            const isHovered = hoveredNodeId === node.id && !node.ghost
            const dimmed =
              highlightActive && hoveredNode !== null && node.id !== hoveredNode.id && !highlightedNeighbors.has(node.id)
            const opacity = node.ghost ? GHOST_OPACITY : dimmed ? DIMMED_OPACITY : 1
            const nodeScale = isHovered ? HOVER_SCALE : 1
            const classes = ['mg-node']
            if (node.ghost) {
              classes.push('mg-node--ghost')
            }
            if (isSelected) {
              classes.push('mg-node--selected')
            }
            const tooltip = `${node.label} · ${formatTime(node.createdAt)}${node.ghost ? ' · 已遗忘' : ''}`
            return (
              <g
                key={node.id}
                className={classes.join(' ')}
                transform={`translate(${point.x} ${point.y}) scale(${nodeScale})`}
                opacity={opacity}
                onClick={() => {
                  onSelectNode(node)
                }}
                onMouseEnter={() => {
                  setHoveredNodeId(node.id)
                }}
                onMouseLeave={() => {
                  setHoveredNodeId(null)
                }}
              >
                <title>{tooltip}</title>
                <circle className="mg-node__hit" r={Math.max(radius + 8, 18)} />
                {isSelected && <circle className="mg-node__selected-ring" r={radius + 5} />}
                <NodeShape category={node.category} radius={radius} />
              </g>
            )
          })}
        </g>
      </g>
    </svg>
  )
}

/** 记忆页的「星链」视图：左栏详情 + 右侧 SVG 星盘。 */
export default function MemoryGraphPanel({
  characterId,
  characterName,
  onOpenConversation
}: MemoryGraphPanelProps) {
  const [graph, setGraph] = useState<MemoryGraphView | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<MemoryGraphNode | null>(null)
  const [detail, setDetail] = useState<MemoryChunkDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isForgetting, setIsForgetting] = useState(false)
  const [scale, setScale] = useState(1)
  const requestRef = useRef(0)
  const detailRequestRef = useRef(0)

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
      // 只渲染当前 characterId 的快照，防止快速切换角色时画出别人的星图。
      if (characterId !== null && view.characterId !== characterId) {
        setError('星图与当前角色不一致，请重试。')
        return
      }
      setGraph(view)
    } catch (loadError: unknown) {
      if (requestRef.current !== requestId) {
        return
      }
      setError(toMessage(loadError))
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
    setIsDetailLoading(false)
    setIsForgetting(false)
    setScale(1)
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
        if (detailRequestRef.current !== requestId) {
          return
        }
        setDetail(chunk)
      })
      .catch((detailLoadError: unknown) => {
        if (detailRequestRef.current !== requestId) {
          return
        }
        setDetailError(toMessage(detailLoadError))
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

  const retryDetail = useCallback((): void => {
    if (selectedNode !== null) {
      selectNode(selectedNode)
    }
  }, [selectNode, selectedNode])

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
      if (characterId !== null && view.characterId !== characterId) {
        setError('星图与当前角色不一致，请重试。')
        return
      }
      // 重建时先保留旧图，成功后才整体替换，避免闪白。
      setGraph(view)
      detailRequestRef.current += 1
      setSelectedNode(null)
      setDetail(null)
      setDetailError(null)
    } catch (rebuildError: unknown) {
      if (requestRef.current === requestId) {
        setError(toMessage(rebuildError))
      }
    } finally {
      setIsRebuilding(false)
      setIsLoading(false)
    }
  }, [characterId])

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

  const zoomStep = useCallback((direction: ZoomDirection): void => {
    setScale((previous) => {
      const factor = direction > 0 ? 1.1 : 0.9
      return clampScale(Math.round(previous * factor * 100) / 100)
    })
  }, [])

  const visibleGraph = useMemo(() => {
    if (graph === null) {
      return null
    }
    if (characterId !== null && graph.characterId !== characterId) {
      return null
    }
    return graph
  }, [characterId, graph])

  const displayName =
    characterName.trim() !== ''
      ? characterName.trim()
      : visibleGraph !== null && visibleGraph.characterName !== ''
        ? visibleGraph.characterName
        : '这位角色'
  const nodeCount = visibleGraph?.nodes.length ?? 0
  // 切换角色后、新快照返回前，旧图已被 visibleGraph 挡掉；这里把这段空窗显示成加载而不是空态。
  const isAwaitingSnapshot = graph !== null && characterId !== null && graph.characterId !== characterId
  const isGraphLoading = isLoading || isAwaitingSnapshot
  const openConversation = onOpenConversation
  const selectedDate = detail !== null ? detail.createdAt : selectedNode?.createdAt ?? null
  const selectedCategory = detail !== null ? detail.category : selectedNode?.category ?? ''
  const detailConversationId = detail !== null && detail.conversationId !== '' ? detail.conversationId : null
  const sourceConversationId = detailConversationId ?? selectedNode?.conversationId ?? null
  const isForgotten = selectedNode?.ghost === true || (detail !== null && detail.invalidAt !== null)

  return (
    <section className="mg" aria-label="记忆星链">
      <header className="mg-toolbar">
        <div className="mg-toolbar__heading">
          <h2 className="mg-title">星链</h2>
          <p className="mg-toolbar__meta">
            {visibleGraph !== null
              ? `第 ${visibleGraph.version} 版 · ${formatTime(visibleGraph.generatedAt)} 生成 · ${MODE_LABELS[visibleGraph.mode]}`
              : isGraphLoading
                ? '正在展开…'
                : '尚未展开'}
          </p>
        </div>
        <div className="mg-toolbar__actions">
          {isRebuilding && (
            <span className="mg-progress" role="status">
              整理中…
            </span>
          )}
          {visibleGraph !== null && (
            <button
              className="btn btn--ghost btn--sm mg-btn"
              type="button"
              disabled={isRebuilding || isGraphLoading}
              onClick={() => {
                void rebuild()
              }}
            >
              <Icon name="refresh" size={15} />
              重新整理
            </button>
          )}
        </div>
      </header>

      {error !== null && (
        <div className="mg-error-row">
          <p className="alert mg-error-text" role="alert">
            {error}
          </p>
          <button
            className="btn btn--ghost btn--sm mg-btn"
            type="button"
            disabled={isGraphLoading || isRebuilding}
            onClick={() => {
              void loadGraph()
            }}
          >
            重试
          </button>
        </div>
      )}

      {visibleGraph === null ? (
        <div className="mg-state">
          {isGraphLoading ? (
            <p className="mg-muted" role="status">
              正在展开星图…
            </p>
          ) : error === null ? (
            <EmptyState />
          ) : null}
        </div>
      ) : (
        <div className="mg-body">
          <aside className="mg-side" aria-label="星链侧栏">
            <div className="mg-side__head">
              <p className="mg-side__eyebrow">当前角色</p>
              <h3 className="mg-character">{displayName}</h3>
              <p className="mg-side__sub">
                {visibleGraph.constellations.length} 个星座 · {visibleGraph.stats.nodes} 颗星球
              </p>
            </div>

            <dl className="mg-stats">
              <div className="mg-stat">
                <dt className="mg-stat__label">星球</dt>
                <dd className="mg-stat__value">{visibleGraph.stats.nodes}</dd>
              </div>
              <div className="mg-stat">
                <dt className="mg-stat__label">连线</dt>
                <dd className="mg-stat__value">{visibleGraph.stats.edges}</dd>
              </div>
              <div className="mg-stat">
                <dt className="mg-stat__label">幽灵</dt>
                <dd className="mg-stat__value">{visibleGraph.stats.ghosts}</dd>
              </div>
            </dl>

            <hr className="mg-divider" />

            {selectedNode === null ? (
              <>
                <p className="mg-hint">
                  {nodeCount === 0 ? '还没有可以展开的星球。' : '点一颗星球，看看她记住了什么。'}
                </p>
                <div className="mg-section">
                  <h4 className="mg-section__title">星座</h4>
                  {visibleGraph.constellations.length === 0 ? (
                    <p className="mg-muted">还没有星座。</p>
                  ) : (
                    <ul className="mg-constellations">
                      {visibleGraph.constellations.map((constellation) => (
                        <li className="mg-constellation" key={constellation.id}>
                          <span>{constellation.label === '' ? '未命名星座' : constellation.label}</span>
                          <span className="mg-count">{constellation.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <div className="mg-detail">
                <div className="mg-detail__head">
                  <div>
                    <p className="mg-side__eyebrow">记忆详情</p>
                    <h4 className="mg-detail__title">{selectedNode.label}</h4>
                  </div>
                  <button className="mg-back" type="button" onClick={clearSelection}>
                    返回星座
                  </button>
                </div>

                <p className="mg-detail__meta">
                  <span>{formatTime(selectedDate)}</span>
                  <span className="mg-tag">{categoryLabel(selectedCategory)}</span>
                  {isForgotten && <span className="mg-tag mg-tag--ghost">已遗忘</span>}
                </p>

                {isDetailLoading && (
                  <p className="mg-muted" role="status">
                    正在读取这条记忆…
                  </p>
                )}

                {detailError !== null && (
                  <div className="mg-detail__error">
                    <p className="alert mg-detail__alert" role="alert">
                      {detailError}
                    </p>
                    <button className="btn btn--ghost btn--sm mg-btn" type="button" onClick={retryDetail}>
                      重试
                    </button>
                  </div>
                )}

                {detail !== null && (
                  <>
                    {detail.topics.length > 0 && (
                      <div className="mg-field">
                        <p className="mg-field__label">话题</p>
                        <div className="mg-chips">
                          {detail.topics.map((topic, index) => (
                            <span className="mg-chip" key={`topic-${index}-${topic}`}>
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {detail.entities.length > 0 && (
                      <div className="mg-field">
                        <p className="mg-field__label">实体</p>
                        <div className="mg-chips">
                          {detail.entities.map((entity, index) => (
                            <span className="mg-chip" key={`entity-${index}-${entity}`}>
                              {entity}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mg-field">
                      <p className="mg-field__label">原文</p>
                      <div className="mg-detail__text" tabIndex={0} aria-label="记忆原文">
                        {detail.content}
                      </div>
                    </div>

                    <div className="mg-actions">
                      {!isForgotten && (
                        <button
                          className="btn btn--danger btn--sm mg-btn mg-forget"
                          type="button"
                          disabled={isForgetting}
                          onClick={() => {
                            void forgetSelected()
                          }}
                        >
                          <Icon name="trash" size={15} />
                          {isForgetting ? '忘记中…' : '忘记'}
                        </button>
                      )}
                      {sourceConversationId !== null && openConversation !== undefined && (
                        <button
                          className="btn btn--ghost btn--sm mg-btn"
                          type="button"
                          onClick={() => {
                            openConversation(sourceConversationId)
                          }}
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

          {nodeCount === 0 ? (
            <div className="mg-canvas mg-canvas--empty">
              <EmptyState />
            </div>
          ) : (
            <div className="mg-canvas">
              <StarCanvas
                graph={visibleGraph}
                characterName={displayName}
                selectedNodeId={selectedNode?.chunkId ?? null}
                scale={scale}
                onSelectNode={selectNode}
                onZoomStep={zoomStep}
              />
              <p className="mg-zoom-hint">滚轮缩放 · {Math.round(scale * 100)}%</p>
              <GraphLegend />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
