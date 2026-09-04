import { Controller, Post, Body, Get, Param, Patch } from '@nestjs/common';
import { ImageService } from './image.service';
import { CreateImageDto } from './dto/create-image.dto';
import { CreateImageVersionDto } from './dto/create-image-version.dto';
import { CreateImageDiffDto } from './dto/create-image-diff.dto';
import { successResponse } from '../common/response.helper';

@Controller('images')
export class ImageController {
  constructor(private svc: ImageService) {}

  @Patch(':id/visibility')
  async updateVisibility(@Param('id') id: string, @Body() body: { visibility: string }) {
    const data = await this.svc.updateVisibility(id, body.visibility);
    return successResponse('Image visibility updated', data);
  }

  @Post()
  create(@Body() dto: CreateImageDto) {
    return this.svc.create(dto);
  }

  @Get()
  async list() {
    const data = await this.svc.findAll();
    return successResponse('Images retrieved', { images: data });
  }

  // Must be declared before :id to avoid "published" being caught as an id param
  @Get('published')
  async listPublished() {
    const data = await this.svc.findPublished();
    return successResponse('Published images retrieved', { images: data });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post(':id/versions')
  createVersion(@Param('id') id: string, @Body() dto: CreateImageVersionDto) {
    return this.svc.createVersion(id, dto);
  }

  @Post(':id/diff-analysis')
  analyzeDiff(@Param('id') id: string, @Body() dto: Omit<CreateImageDiffDto, 'targetVersionId'>) {
    return this.svc.analyzeDiff({ ...dto, targetVersionId: id });
  }
}
