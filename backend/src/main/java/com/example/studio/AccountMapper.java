package com.example.studio;

import com.fasterxml.jackson.annotation.JsonIgnore;
import org.apache.ibatis.annotations.*;

@Mapper
public interface AccountMapper {
  class SessionRow {

    public String ownerId;
    public String pendingGuestId;
  }

  class AccountRow {

    public String ownerId;
    public String email;
    public String displayName;

    @JsonIgnore
    public String passwordHash;
  }

  @Insert("INSERT INTO studio_owner(id) VALUES(#{id})")
  void owner(String id);

  @Select(
    "SELECT id FROM studio_owner WHERE id=#{id} AND retired=FALSE FOR UPDATE"
  )
  String lockOwner(String id);

  @Select(
    "SELECT owner_id,pending_guest_id FROM auth_session WHERE token_hash=#{hash} AND expires_at>NOW()"
  )
  SessionRow session(String hash);

  @Select("SELECT owner_id,pending_guest_id FROM auth_session WHERE token_hash=#{hash} AND expires_at>NOW() FOR UPDATE")
  SessionRow lockSession(String hash);

  @Insert(
    "INSERT INTO auth_session(token_hash,owner_id,pending_guest_id,expires_at) VALUES(#{hash},#{owner},#{guest},DATE_ADD(NOW(),INTERVAL 30 DAY))"
  )
  void insertSession(
    @Param("hash") String hash,
    @Param("owner") String owner,
    @Param("guest") String guest
  );

  @Delete("DELETE FROM auth_session WHERE token_hash=#{hash}")
  void revoke(String hash);

  @Delete("DELETE FROM auth_session WHERE owner_id=#{owner}")
  void revokeOwner(String owner);

  @Select("SELECT * FROM account WHERE email=#{email}")
  AccountRow byEmail(String email);

  @Select("SELECT * FROM account WHERE owner_id=#{owner}")
  AccountRow byOwner(String owner);

  @Insert(
    "INSERT INTO account(owner_id,email,display_name,password_hash) VALUES(#{ownerId},#{email},#{displayName},#{passwordHash})"
  )
  void account(AccountRow row);

  @Select("SELECT COUNT(*) FROM creation_task WHERE owner_id=#{owner} AND deleted_at IS NULL")
  int taskCount(String owner);

  @Select("SELECT COUNT(*) FROM asset WHERE owner_id=#{owner}")
  int assetCount(String owner);

  @Update("UPDATE asset SET owner_id=#{owner} WHERE owner_id=#{guest}")
  void moveAssets(@Param("owner") String owner, @Param("guest") String guest);

  @Update(
    "UPDATE creation_task SET owner_id=#{owner},version=version+1,updated_at=NOW(3) WHERE owner_id=#{guest}"
  )
  void moveTasks(@Param("owner") String owner, @Param("guest") String guest);

  @Update(
    "UPDATE auth_session SET pending_guest_id=NULL WHERE pending_guest_id=#{guest}"
  )
  void clearGuest(String guest);

  @Update("UPDATE studio_owner SET retired=TRUE WHERE id=#{guest}")
  void retire(String guest);
}
