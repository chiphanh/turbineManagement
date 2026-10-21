import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { ProjectsService } from "./projects.service";

@Module({
  providers: [DatabaseService, ProjectsService],
  exports: [DatabaseService, ProjectsService],
})
export class ProjectsModule {}
