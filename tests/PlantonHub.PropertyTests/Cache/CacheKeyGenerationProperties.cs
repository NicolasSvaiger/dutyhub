using System.Linq;
using FluentAssertions;
using FsCheck;
using FsCheck.Xunit;
using PlantonHub.Infrastructure.Cache;

namespace PlantonHub.PropertyTests.Cache;

/// <summary>
/// Property-based tests for CacheKeys generation.
/// Validates: Requirements 2.3, 3.4, 4.4, 5.4
/// </summary>
[Trait("Feature", "redis-cache-layer")]
[Collection("CacheKeys")] // Disable parallelism for tests that share static CacheKeys state
public class CacheKeyGenerationProperties
{
    private const string TestPrefix = "testprefix";

    public CacheKeyGenerationProperties()
    {
        CacheKeys.SetPrefix(TestPrefix);
    }

    /// <summary>
    /// **Validates: Requirements 2.3, 3.4, 4.4, 5.4**
    /// Property 1: Cache keys always start with the configured prefix and use colon as separator.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property Clinics_Key_Starts_With_Prefix_And_Contains_ClinicId()
    {
        return Prop.ForAll(Arb.Default.Guid().Filter(g => g != Guid.Empty), clinicId =>
        {
            CacheKeys.SetPrefix(TestPrefix);
            var key = CacheKeys.Clinics(clinicId);

            key.Should().NotBeNullOrEmpty();
            key.Should().StartWith($"{TestPrefix}:");
            key.Should().Contain(clinicId.ToString());
            key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
        });
    }

    /// <summary>
    /// **Validates: Requirements 2.3, 3.4, 4.4, 5.4**
    /// Property 1: ClinicsAll key always starts with prefix and uses colon separator.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property ClinicsAll_Key_Starts_With_Prefix_And_Is_Not_Empty()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get) && !s.Get.Contains(':')),
            prefix =>
            {
                CacheKeys.SetPrefix(prefix.Get);
                var key = CacheKeys.ClinicsAll();

                key.Should().NotBeNullOrEmpty();
                key.Should().StartWith($"{prefix.Get}:");
                key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
            });
    }

    /// <summary>
    /// **Validates: Requirements 2.3, 4.4**
    /// Property 1: Shifts key includes prefix, colon separator, and clinicId scope.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property Shifts_Key_Starts_With_Prefix_And_Contains_ClinicId()
    {
        return Prop.ForAll(Arb.Default.Guid().Filter(g => g != Guid.Empty), clinicId =>
        {
            CacheKeys.SetPrefix(TestPrefix);
            var key = CacheKeys.Shifts(clinicId);

            key.Should().NotBeNullOrEmpty();
            key.Should().StartWith($"{TestPrefix}:");
            key.Should().Contain(clinicId.ToString());
            key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
        });
    }

    /// <summary>
    /// **Validates: Requirements 2.3, 4.4**
    /// Property 1: ShiftsUser key includes prefix, clinicId, and userId scopes.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property ShiftsUser_Key_Starts_With_Prefix_And_Contains_ClinicId_And_UserId()
    {
        return Prop.ForAll(
            Arb.Default.Guid().Filter(g => g != Guid.Empty),
            Arb.Default.Guid().Filter(g => g != Guid.Empty),
            (clinicId, userId) =>
            {
                CacheKeys.SetPrefix(TestPrefix);
                var key = CacheKeys.ShiftsUser(clinicId, userId);

                key.Should().NotBeNullOrEmpty();
                key.Should().StartWith($"{TestPrefix}:");
                key.Should().Contain(clinicId.ToString());
                key.Should().Contain(userId.ToString());
                key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
            });
    }

    /// <summary>
    /// **Validates: Requirements 2.3, 5.4**
    /// Property 1: UserProfile key includes prefix and userId scope.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property UserProfile_Key_Starts_With_Prefix_And_Contains_UserId()
    {
        return Prop.ForAll(Arb.Default.Guid().Filter(g => g != Guid.Empty), userId =>
        {
            CacheKeys.SetPrefix(TestPrefix);
            var key = CacheKeys.UserProfile(userId);

            key.Should().NotBeNullOrEmpty();
            key.Should().StartWith($"{TestPrefix}:");
            key.Should().Contain(userId.ToString());
            key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
        });
    }

    /// <summary>
    /// **Validates: Requirements 2.3**
    /// Property 1: TokenBlacklist key includes prefix and jti scope.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property TokenBlacklist_Key_Starts_With_Prefix_And_Contains_Jti()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => !string.IsNullOrWhiteSpace(s.Get) && !s.Get.Contains(':')),
            jti =>
            {
                CacheKeys.SetPrefix(TestPrefix);
                var key = CacheKeys.TokenBlacklist(jti.Get);

                key.Should().NotBeNullOrEmpty();
                key.Should().StartWith($"{TestPrefix}:");
                key.Should().Contain(jti.Get);
                key.Split(':').Length.Should().BeGreaterThanOrEqualTo(2);
            });
    }

    /// <summary>
    /// **Validates: Requirements 2.3, 3.4, 4.4, 5.4**
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
                CacheKeys.SetPrefix(TestPrefix);

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
                    // All segments should be non-empty (no double colons)
                    var segments = key.Split(':');
                    segments.Should().AllSatisfy(s => s.Should().NotBeEmpty());
                }
            });
    }

    /// <summary>
    /// **Validates: Requirements 2.3**
    /// Property 1: Changing the prefix via SetPrefix affects all generated keys.
    /// </summary>
    [Property(MaxTest = 100)]
    [Trait("Feature", "redis-cache-layer")]
    public Property SetPrefix_Changes_Prefix_For_All_Keys()
    {
        return Prop.ForAll(
            Arb.Default.NonEmptyString().Filter(s => s != null && !string.IsNullOrWhiteSpace(s.Get) && !s.Get.Contains(':') && s.Get.All(c => !char.IsControl(c))),
            Arb.Default.Guid().Filter(g => g != Guid.Empty),
            (prefix, id) =>
            {
                CacheKeys.SetPrefix(prefix.Get);

                CacheKeys.Clinics(id).Should().StartWith($"{prefix.Get}:");
                CacheKeys.ClinicsAll().Should().StartWith($"{prefix.Get}:");
                CacheKeys.Shifts(id).Should().StartWith($"{prefix.Get}:");
                CacheKeys.ShiftsUser(id, id).Should().StartWith($"{prefix.Get}:");
                CacheKeys.UserProfile(id).Should().StartWith($"{prefix.Get}:");
                CacheKeys.TokenBlacklist(id.ToString()).Should().StartWith($"{prefix.Get}:");
            });
    }
}
