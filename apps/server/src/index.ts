import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import './db'
import { projects } from './routes/projects'
import { settings } from './routes/settings'
import { model } from './routes/model'
import { image } from './routes/image'
import { upload } from './routes/upload'

const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/projects', projects)
app.route('/api/settings', settings)
app.route('/api', model)
app.route('/api', image)
app.route('/api', upload)

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port })
console.log(`[openflow-server] listening on http://localhost:${port}`)

export { app }
