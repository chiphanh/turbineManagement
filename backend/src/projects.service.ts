import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { CreateProjectDto, UpdateProjectDto, ListProjectsDto } from './projects.dto';
const COLUMNS = `id, notes, team_id AS "teamId", customer_name AS "customerName", address, rated_power_kw::float8 AS "ratedPowerKw", stage, created_at AS "createdAt", updated_at AS "updatedAt"`;
@Injectable()
export class ProjectsService {
  constructor(private readonly db: DatabaseService) {}
  async list(query: ListProjectsDto) {
    const args: unknown[] = [];
    const clauses: string[] = [];
    if (query.stage) { args.push(query.stage); clauses.push(`stage = $${args.length}`); }
    if (query.search?.trim()) {
      args.push(query.search.trim());
      clauses.push(`(strpos(lower(customer_name), lower($${args.length})) > 0 OR strpos(lower(address), lower($${args.length})) > 0)`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    // One query returns a count even for an empty/out-of-range page.
    const result = await this.db.pool.query(`WITH filtered AS (SELECT ${COLUMNS} FROM projects ${where}), page AS (SELECT * FROM filtered ORDER BY "createdAt" DESC, id LIMIT $${args.length+1} OFFSET $${args.length+2}) SELECT (SELECT count(*)::int FROM filtered) AS total, COALESCE((SELECT json_agg(page ORDER BY "createdAt" DESC, id) FROM page), '[]'::json) AS data`, [...args, query.pageSize, (query.page-1)*query.pageSize]);
    return { ...result.rows[0], page: query.page, pageSize: query.pageSize };
  }
  async get(id: string) {
    const result = await this.db.pool.query(`SELECT ${COLUMNS} FROM projects WHERE id = $1`, [id]);
    if (!result.rows[0]) throw new NotFoundException('Project not found');
    return result.rows[0];
  }
  async create(dto: CreateProjectDto) {
    return (await this.db.pool.query(`INSERT INTO projects (customer_name, address, rated_power_kw, stage, notes) VALUES ($1,$2,$3,$4,$5) RETURNING ${COLUMNS}`, [dto.customerName.trim(), dto.address.trim(), dto.ratedPowerKw, dto.stage ?? 'inspection', dto.notes ?? ''])).rows[0];
  }
  async update(id: string, dto: UpdateProjectDto) {
    const values: unknown[] = [];
    const updates: string[] = [];
    const fields = { customerName: 'customer_name', address: 'address', ratedPowerKw: 'rated_power_kw', stage: 'stage', notes: 'notes' } as const;
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      const value = dto[key];
      if (value === null) throw new BadRequestException(`${key} cannot be null`);
      if (value !== undefined) {
        values.push(typeof value === 'string' ? value.trim() : value);
        updates.push(`${fields[key]} = $${values.length}`);
      }
    }
    if (!updates.length) throw new BadRequestException('Provide at least one field to update');
    values.push(id);
    const result = await this.db.pool.query(`UPDATE projects SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING ${COLUMNS}`, values);
    if (!result.rows[0]) throw new NotFoundException('Project not found');
    return result.rows[0];
  }
}
