using System.Linq;
using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using PlantonHub.Application.Constants;

namespace PlantonHub.PropertyTests.Cache;

/// <summary>
/// Property-based tests for CacheKeys generation.
/// CacheKeys now generate keys WITHOUT a prefix (prefix is added by RedisCacheService.PrefixKey).
/// Validates: Requirements 2.3, 3.4, 4.4, 5.4
/// </summary>
[Trait("Feature", "redis-cache-layer")]
public class CacheKeyGenerationProperties
{
    /// <summary>
    /// Property 1: Clinics key contains clinicId and uses colon separators.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property Clinics_Key_Contains_ClinicId_And_Uses_Colon_Separator()
    {
        return Prop.ForAll(Arb.Default.Guid().Filter(g => g != Guid.Empty), clinicId =>
        {
            var key = CacheKeys.Clinics(clinicId);

            key.Should().NotBeNullOrEmpty();
            key.Should().StartWith("clinics:");
            key.Should().Contain(clinicId.ToString());
            key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
        });
    }

    /// <summary>
    /// Property 1: ClinicsAll key is a fixed well-known value.
    /// </summary>
    [Fact]
    [Trait("Feature", "redis-cache-layer")]
    public void ClinicsAll_Key_Is_Fixed_Value()
    {
        var key = CacheKeys.ClinicsAll();

        key.Should().Be("clinics:all");
    }

    /// <summary>
    /// Property 1: Shifts key includes clinicId scope.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property Shifts_Key_Contains_ClinicId()
    {
        return Prop.ForAll(Arb.Default.Guid().Filter(g => g != Guid.Empty), clinicId =>
        {
            var key = CacheKeys.Shifts(clinicId);

            key.Should().NotBeNullOrEmpty();
            key.Should().StartWith("shifts:");
            key.Should().Contain(clinicId.ToString());
            key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
        });
    }

    /// <summary>
    /// Property 1: ShiftsUser key includes clinicId and userId scopes.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property ShiftsUser_Key_Contains_ClinicId_And_UserId()
    {
        return Prop.ForAll(
            Arb.Default.Guid().Filter(g => g != Guid.Empty),
            Arb.Default.Guid().Filter(g => g != Guid.Empty),
            (clinicId, userId) =>
            {
                var key = CacheKeys.ShiftsUser(clinicId, userId);

                key.Should().NotBeNullOrEmpty();
                key.Should().StartWith("shifts:");
                key.Should().Contain(clinicId.ToString());
                key.Should().Contain(userId.ToString());
                key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
            });
    }

    /// <summary>
    /// Property 1: UserProfile key includes userId scope.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property UserProfile_Key_Contains_UserId()
    {
        return Prop.ForAll(Arb.Default.Guid().Filter(g => g != Guid.Empty), userId =>
        {
            var key = CacheKeys.UserProfile(userId);

            key.Should().NotBeNullOrEmpty();
            key.Should().StartWith("users:");
            key.Should().Contain(userId.ToString());
            key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
        });
    }

    /// <summary>
    /// Property 1: TokenBlacklist key includes jti scope.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property TokenBlacklist_Key_Contains_Jti()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get) && !s.Get.Contains(':')),
            jti =>
            {
                var key = CacheKeys.TokenBlacklist(jti.Get);

                key.Should().NotBeNullOrEmpty();
                key.Should().StartWith("blacklist:");
                key.Should().Contain(jti.Get);
                key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
            });
    }

    /// <summary>
    /// Property 1: All cache keys use colon as separator between segments.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property All_Keys_Use_Colon_Separator_Between_Segments()
    {
        return Prop.ForAll(
            Arb.Default.Guid().Filter(g => g != Guid.Empty),
            Arb.Default.Guid().Filter(g => g != Guid.Empty),
            (id1, id2) =>
            {
                var keys = new[]
                {
                    CacheKeys.Clinics(id1),
                    CacheKeys.ClinicsAll(),
                    CacheKeys.Shifts(id1),
                    CacheKeys.ShiftsUser(id1, id2),
                    CacheKeys.UserProfile(id1),
                    CacheKeys.TokenBlacklist(id1.ToString())
                };

                foreach (var key in keys)
                {
                    key.Should().NotBeNullOrEmpty();
                    key.Should().Contain(":");
                    var segments = key.Split(':');
                    segments.Should().AllSatisfy(s => s.Should().NotBeEmpty());
                }
            });
    }
}
