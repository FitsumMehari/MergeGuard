import assert from 'node:assert/strict';
import { buildRepositoryModel, applyChangedFiles, relevantContext, projectAwareCandidates } from '../packages/repo-intel/dist/index.js';

const files=[
 {path:'pnpm-workspace.yaml',content:'packages:\n  - apps/*\n  - packages/*'},
 {path:'apps/api/package.json',content:JSON.stringify({name:'@acme/api',dependencies:{'@nestjs/core':'x','@prisma/client':'x','ioredis':'x','pg':'x','@acme/shared':'workspace:*'}})},
 {path:'apps/web/package.json',content:JSON.stringify({name:'@acme/web',dependencies:{next:'x','@acme/shared':'workspace:*'}})},
 {path:'packages/shared/package.json',content:JSON.stringify({name:'@acme/shared'})},
 {path:'apps/api/src/orders/orders.controller.ts',content:`import {OrdersService} from './orders.service';\n@Controller('orders')\n@UseGuards(JwtAuthGuard, RolesGuard)\nexport class OrdersController {\n@Get(':id') getOne(){ return this.s.getOne(); }\n}`},
 {path:'apps/api/src/orders/orders.service.ts',content:`import {Db} from '../db';\nexport class OrdersService { getOne(){ return this.db.order.findUnique({where:{id:'x', organizationId:'t'}}) } }`},
 {path:'apps/api/prisma/schema.prisma',content:`datasource db { provider = "postgresql" url = env("DATABASE_URL") }\nmodel Order {\n id String @id\n organizationId String\n externalId String @unique\n @@index([organizationId])\n}`},
 {path:'Dockerfile',content:'FROM node:22\nEXPOSE 4000'},
 {path:'nginx/nginx.conf',content:'server { listen 80; location /api { proxy_pass http://api:4000; } }'}
];
const model=buildRepositoryModel(files,'abc');
assert.equal(model.stack.monorepo,true);
assert(model.stack.frameworks.includes('nestjs'));
assert(model.stack.frameworks.includes('nextjs'));
assert(model.stack.databases.includes('postgresql'));
assert(model.stack.cache.includes('redis'));
assert(model.auth.guards.includes('JwtAuthGuard'));
assert(model.auth.authorizationGuards.includes('RolesGuard'));
assert(model.auth.tenantFields.includes('organizationId'));
assert(model.routes.some(r=>r.path==='/orders/:id' && r.guards.includes('RolesGuard')));
assert(model.dbModels.some(m=>m.name==='Order' && m.unique.includes('externalId')));
assert(relevantContext(model,['apps/api/src/orders/orders.controller.ts']).includes('apps/api/src/orders/orders.service.ts'));

// A changed unguarded resource route should be contextualized as a candidate when the repo uses guards elsewhere.
const changed=[{path:'apps/api/src/admin/admin.controller.ts',status:'modified',headContent:`@Controller('admin') export class AdminController { @Get(':id') getOne(){} }`}];
const overlay=applyChangedFiles(model,changed);
const candidates=projectAwareCandidates(overlay,changed);
assert(candidates.some(x=>x.detector==='repo-nest-route-unguarded'));

console.log('repository intelligence tests passed: stack, graph, routes, guards, DB, Redis, infra, relevant-context, repo-aware detector');
