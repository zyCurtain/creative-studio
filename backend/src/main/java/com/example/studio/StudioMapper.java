package com.example.studio;

import com.example.studio.Models.*;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface StudioMapper {
  @Select("SELECT * FROM template WHERE deleted_at IS NULL AND (owner_id IS NULL OR owner_id=#{owner}) ORDER BY sort_order,created_at,id")
  List<Template> templates(String owner);

  @Insert("INSERT INTO template(id,title,category,description,palette,required_image_count,sort_order,owner_id,cover_asset_id,prompt) VALUES(#{id},#{title},#{category},#{description},#{palette},#{requiredImageCount},100,#{ownerId},#{coverAssetId},#{prompt})")
  void insertTemplate(Template template);

  @Select("SELECT * FROM template WHERE id=#{id}")
  Template template(String id);

  @Update("UPDATE template SET deleted_at=NOW(3) WHERE id=#{id} AND owner_id=#{owner} AND deleted_at IS NULL")
  int deleteTemplate(@Param("id") String id, @Param("owner") String owner);

  @Select(
    "SELECT id FROM studio_owner WHERE id=#{id} AND retired=FALSE FOR UPDATE"
  )
  String lockOwner(String id);

  @Insert(
    "INSERT INTO asset(id,owner_id,original_name,storage_key,mime_type,size_bytes) VALUES(#{id},#{ownerId},#{originalName},#{storageKey},#{mimeType},#{sizeBytes})"
  )
  void insertAsset(Asset asset);

  @Select("SELECT * FROM asset WHERE id=#{id} AND owner_id=#{owner}")
  Asset asset(@Param("id") String id, @Param("owner") String owner);

  @Insert(
    "INSERT INTO creation_task(id,owner_id,template_id,template_title,status,fail_at,delay_ms,generation_mode,generation_model) VALUES(#{id},#{ownerId},#{templateId},#{templateTitle},'QUEUED',#{failAt},#{delayMs},#{generationMode},#{generationModel})"
  )
  void insertTask(Task task);

  @Insert(
    "INSERT INTO task_asset(task_id,asset_id,slot_index) VALUES(#{task},#{asset},#{slot})"
  )
  void link(
    @Param("task") String task,
    @Param("asset") String asset,
    @Param("slot") int slot
  );

  @Insert(
    "INSERT INTO task_stage(task_id,stage,position,status) VALUES(#{task},#{stage},#{position},'PENDING')"
  )
  void insertStage(
    @Param("task") String task,
    @Param("stage") String stage,
    @Param("position") int position
  );

  @Select("SELECT * FROM creation_task WHERE id=#{id} AND deleted_at IS NULL")
  Task task(String id);

  @Update("UPDATE creation_task SET deleted_at=NOW(3),version=version+1 WHERE id=#{id} AND owner_id=#{owner} AND deleted_at IS NULL AND status IN ('SUCCEEDED','FAILED')")
  int deleteTask(@Param("id") String id, @Param("owner") String owner);

  @Select(
    "SELECT a.* FROM asset a JOIN task_asset t ON t.asset_id=a.id WHERE t.task_id=#{id} ORDER BY t.slot_index"
  )
  List<Asset> inputs(String id);

  @Select("SELECT * FROM task_stage WHERE task_id=#{id} ORDER BY position")
  List<Stage> stages(String id);

  @Select(
    "<script>SELECT * FROM creation_task WHERE owner_id=#{owner} AND deleted_at IS NULL<if test='template != null'> AND template_id=#{template}</if><if test='active'> AND status IN ('QUEUED','RUNNING')</if> ORDER BY created_at DESC,id DESC LIMIT #{limit} OFFSET #{offset}</script>"
  )
  List<Task> history(
    @Param("owner") String owner,
    @Param("template") String template,
    @Param("active") boolean active,
    @Param("limit") int limit,
    @Param("offset") int offset
  );

  @Update(
    "UPDATE creation_task SET status='RUNNING',version=version+1,updated_at=NOW(3) WHERE id=#{id} AND status='QUEUED'"
  )
  int claim(String id);

  @Update(
    "UPDATE creation_task SET current_stage=#{stage},version=version+1,updated_at=NOW(3) WHERE id=#{id} AND status='RUNNING'"
  )
  int phase(@Param("id") String id, @Param("stage") String stage);

  @Update(
    "UPDATE task_stage SET status=#{status},started_at=CASE WHEN #{status}='RUNNING' THEN NOW(3) ELSE started_at END,finished_at=CASE WHEN #{status} IN ('SUCCEEDED','FAILED','SKIPPED') THEN NOW(3) ELSE NULL END WHERE task_id=#{id} AND stage=#{stage}"
  )
  void stage(
    @Param("id") String id,
    @Param("stage") String stage,
    @Param("status") String status
  );

  @Update(
    "UPDATE creation_task SET status='SUCCEEDED',result_storage_key=#{path},version=version+1,updated_at=NOW(3) WHERE id=#{id} AND status='RUNNING'"
  )
  void succeed(@Param("id") String id, @Param("path") String path);

  @Update(
    "UPDATE creation_task SET status='FAILED',failed_stage=current_stage,error_code=#{code},error_message=#{message},version=version+1,updated_at=NOW(3) WHERE id=#{id} AND status IN ('QUEUED','RUNNING')"
  )
  void fail(
    @Param("id") String id,
    @Param("code") String code,
    @Param("message") String message
  );

  @Update(
    "UPDATE task_stage SET status=CASE WHEN status='RUNNING' THEN 'FAILED' ELSE 'SKIPPED' END,finished_at=NOW(3) WHERE task_id=#{id} AND status IN ('PENDING','RUNNING')"
  )
  void stopStages(String id);

  @Select("SELECT * FROM creation_task WHERE status IN ('QUEUED','RUNNING')")
  List<Task> interrupted();
}
