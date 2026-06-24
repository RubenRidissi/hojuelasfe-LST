import { supabase } from './supabase'

/**
 * Wrapper genérico para queries a Supabase
 * Equivalente a la función api() del HTML anterior
 */
export async function api(table, method = 'GET', body = null, query = '') {
  let req = supabase.from(table)

  if (method === 'GET') {
    // Parsear query string simple: ?campo=eq.valor&order=x.desc&limit=n
    req = req.select(parseSelect(query))
    const filters = parseFilters(query)
    filters.forEach(f => {
      req = applyFilter(req, f)
    })
    const order = parseOrder(query)
    if (order) req = req.order(order.col, { ascending: order.asc })
    const limit = parseLimit(query)
    if (limit) req = req.limit(limit)
  } else if (method === 'POST') {
    req = req.insert(body).select()
  } else if (method === 'PATCH') {
    req = req.update(body)
    const filters = parseFilters(query)
    filters.forEach(f => { req = applyFilter(req, f) })
    req = req.select()
  } else if (method === 'DELETE') {
    req = req.delete()
    const filters = parseFilters(query)
    filters.forEach(f => { req = applyFilter(req, f) })
  }

  const { data, error } = await req
  if (error) throw error
  return data
}

function parseSelect(query) {
  const m = query.match(/[?&]select=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : '*'
}

function parseFilters(query) {
  const filters = []
  const parts = query.split(/[?&]/).filter(Boolean)
  parts.forEach(part => {
    const [key, val] = part.split('=')
    if (!key || !val || key === 'select' || key === 'order' || key === 'limit') return
    const ops = ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'like', 'ilike', 'in', 'is']
    for (const op of ops) {
      if (val.startsWith(op + '.')) {
        filters.push({ col: key, op, val: decodeURIComponent(val.slice(op.length + 1)) })
        break
      }
    }
  })
  return filters
}

function applyFilter(req, { col, op, val }) {
  if (op === 'eq')    return req.eq(col, val)
  if (op === 'neq')   return req.neq(col, val)
  if (op === 'gte')   return req.gte(col, val)
  if (op === 'lte')   return req.lte(col, val)
  if (op === 'gt')    return req.gt(col, val)
  if (op === 'lt')    return req.lt(col, val)
  if (op === 'like')  return req.like(col, val)
  if (op === 'ilike') return req.ilike(col, val)
  if (op === 'in')    return req.in(col, val.replace(/[()]/g, '').split(','))
  if (op === 'is')    return req.is(col, val === 'null' ? null : val)
  return req
}

function parseOrder(query) {
  const m = query.match(/[?&]order=([^&]+)/)
  if (!m) return null
  const parts = m[1].split('.')
  return { col: parts[0], asc: parts[1] !== 'desc' }
}

function parseLimit(query) {
  const m = query.match(/[?&]limit=(\d+)/)
  return m ? parseInt(m[1]) : null
}
