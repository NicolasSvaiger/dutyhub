using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantonHub.Domain.Entities;

namespace PlantonHub.Infrastructure.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="UserPublicOrganRole"/>. Espelha o padrão
/// de <see cref="UserClinicRoleConfiguration"/> — junction table simples com
/// unique composto e cascade nos dois pais.
/// </summary>
public class UserPublicOrganRoleConfiguration : IEntityTypeConfiguration<UserPublicOrganRole>
{
    public void Configure(EntityTypeBuilder<UserPublicOrganRole> builder)
    {
        builder.HasKey(upr => upr.Id);

        // Um usuário só pode ter um role por organ. Se no futuro admitirmos
        // roles diferentes (ex.: "Auditor" além de "GestorPublico"), o unique
        // pode incluir Role. Por ora o modelo simples serve.
        builder.HasIndex(upr => new { upr.UserId, upr.PublicOrganId })
            .IsUnique()
            .HasDatabaseName("IX_UserPublicOrganRole_UserId_PublicOrganId");

        // Índice reverso — telas administrativas listam "gestores do organ X".
        builder.HasIndex(upr => upr.PublicOrganId)
            .HasDatabaseName("IX_UserPublicOrganRole_PublicOrganId");

        builder.Property(upr => upr.Role)
            .HasConversion<int>();

        builder.HasOne(upr => upr.User)
            .WithMany()  // sem coleção no User pra evitar poluir a entity
            .HasForeignKey(upr => upr.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(upr => upr.PublicOrgan)
            .WithMany()  // idem — PublicOrgan já tem várias navs (Children, Contracts)
            .HasForeignKey(upr => upr.PublicOrganId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
