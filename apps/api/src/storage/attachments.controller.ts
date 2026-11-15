import { Controller, Get, HttpException, HttpStatus, Param, ParseUUIDPipe, Put, Query, Req, Res } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { dbCtx, RequireModule } from '../auth/auth.guard';
import { mapDbError } from '../common/http';

@Controller()
@RequireModule(3)
export class AttachmentsController {
  constructor(private att: AttachmentsService) {}

  /** Unggah berkas sebagai badan mentah (Content-Type image/* atau application/pdf). */
  @Put('work-orders/:id/attachments')
  async upload(@Param('id', ParseUUIDPipe) id: string, @Query('filename') filename: string | undefined, @Req() req: any) {
    if (!Buffer.isBuffer(req.body)) throw new HttpException('Kirim berkas sebagai badan mentah (image/* atau application/pdf)', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    try {
      return await this.att.save(dbCtx(req.user), { orgId: req.user.org, userId: req.user.sub, name: req.user.name }, id, req.body, filename, 'web');
    } catch (e) { mapDbError(e); }
  }

  /** Unduh/tampilkan lampiran (butuh login; bucket tidak publik). */
  @Get('attachments/:id/file')
  async file(@Param('id', ParseUUIDPipe) id: string, @Req() req: any, @Res() res: any) {
    const f = await this.att.read(dbCtx(req.user), id);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(Buffer.from(f.data));
  }
}
