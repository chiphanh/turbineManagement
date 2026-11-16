import "reflect-metadata";
import "dotenv/config";
import {
  Controller,
  Query,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Module,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DatabaseService } from "./database.service";
import { ProjectsService } from "./projects.service";
import {
  CreateProjectDto,
  UpdateProjectDto,
  ListProjectsDto,
} from "./projects.dto";
import { OperationsService } from "./operations.service";
import {
  AssignmentDto,
  BookingDto,
  CreateTeamDto,
  UpdateTeamDto,
} from "./operations.dto";

import { AiController } from "./ai/ai.controller";
import { AiService } from "./ai/ai.service";
import { AiGuard } from "./ai/ai.guard";
import { EvaluationService } from "./ai/evaluation.service";
@Controller("projects")
class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly operations: OperationsService
  ) {}
  @Patch(":id/team") assign(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: AssignmentDto
  ) {
    return this.operations.assign(id, dto);
  }
  @Get() list(@Query() query: ListProjectsDto) {
    return this.projects.list(query);
  }
  @Get(":id") get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.projects.get(id);
  }
  @Post() create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }
  @Patch(":id") update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProjectDto
  ) {
    return this.projects.update(id, dto);
  }
}

@Controller("teams")
class TeamsController {
  constructor(private readonly operations: OperationsService) {}
  @Get() list() {
    return this.operations.teams();
  }
  @Post() create(@Body() dto: CreateTeamDto) {
    return this.operations.createTeam(dto);
  }
  @Patch(":id") update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTeamDto
  ) {
    return this.operations.updateTeam(id, dto);
  }
}

@Controller("bookings")
class BookingsController {
  constructor(private readonly operations: OperationsService) {}
  @Get() list() {
    return this.operations.bookings();
  }
  @Post() create(@Body() dto: BookingDto) {
    return this.operations.schedule(dto);
  }
  @Post(":id/cancel") cancel(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.operations.cancel(id);
  }
}

@Controller("health")
class HealthController {
  @Get() health() {
    return { status: "ok" };
  }
}
@Module({
  controllers: [
    AiController,
    ProjectsController,
    TeamsController,
    BookingsController,
    HealthController,
  ],
  providers: [
    AiGuard,
    AiService,
    EvaluationService,
    DatabaseService,
    ProjectsService,
    OperationsService,
  ],
})
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  });
  app.enableShutdownHooks();
  console.log("process.env", process.env.HOST, process.env.GROQ_API_KEY);
  await app.listen(
    Number(process.env.PORT ?? 3001),
    process.env.HOST ?? "127.0.0.1"
  );
}

bootstrap().catch((error: unknown) => {
  console.error(
    "Startup failed. Check DATABASE_URL, migrations, PORT and your environment configuration.",
    error
  );
  process.exit(1);
});
