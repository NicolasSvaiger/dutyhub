using FluentAssertions;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PlantonHub.API.Filters;
using PlantonHub.Application.DTOs.Auth;

namespace PlantonHub.UnitTests.Filters;

public class ValidationActionFilterTests
{
    private (ActionExecutingContext context, Mock<ActionExecutionDelegate> next) CreateContext(
        object? argument, IServiceProvider serviceProvider)
    {
        var httpContext = new DefaultHttpContext { RequestServices = serviceProvider };
        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        var arguments = new Dictionary<string, object?>();
        if (argument is not null) arguments["request"] = argument;

        var context = new ActionExecutingContext(
            actionContext,
            new List<IFilterMetadata>(),
            arguments,
            new object());

        var next = new Mock<ActionExecutionDelegate>();
        next.Setup(n => n()).ReturnsAsync(new ActionExecutedContext(actionContext, new List<IFilterMetadata>(), new object()));

        return (context, next);
    }

    [Fact]
    public async Task OnActionExecutionAsync_ValidRequest_CallsNext()
    {
        var validator = new Mock<IValidator<FaceLoginRequest>>();
        validator.Setup(v => v.ValidateAsync(It.IsAny<ValidationContext<object>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ValidationResult());

        var services = new ServiceCollection();
        services.AddSingleton<IValidator<FaceLoginRequest>>(validator.Object);
        var sp = services.BuildServiceProvider();

        var filter = new ValidationActionFilter(sp);
        var request = new FaceLoginRequest { Email = "test@test.com", Embedding = new float[128], DeviceId = "d", Platform = "android" };
        var (context, next) = CreateContext(request, sp);

        await filter.OnActionExecutionAsync(context, next.Object);

        context.Result.Should().BeNull();
        next.Verify(n => n(), Times.Once);
    }

    [Fact]
    public async Task OnActionExecutionAsync_InvalidRequest_Returns400WithErrors()
    {
        var failures = new List<ValidationFailure>
        {
            new("Email", "Email é obrigatório."),
            new("Embedding", "Embedding deve ter exatamente 128 dimensões."),
        };
        var validator = new Mock<IValidator<FaceLoginRequest>>();
        validator.Setup(v => v.ValidateAsync(It.IsAny<ValidationContext<object>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ValidationResult(failures));

        var services = new ServiceCollection();
        services.AddSingleton<IValidator<FaceLoginRequest>>(validator.Object);
        var sp = services.BuildServiceProvider();

        var filter = new ValidationActionFilter(sp);
        var request = new FaceLoginRequest();
        var (context, next) = CreateContext(request, sp);

        await filter.OnActionExecutionAsync(context, next.Object);

        context.Result.Should().BeOfType<BadRequestObjectResult>();
        next.Verify(n => n(), Times.Never);
    }

    [Fact]
    public async Task OnActionExecutionAsync_NoValidatorRegistered_CallsNext()
    {
        var services = new ServiceCollection();
        var sp = services.BuildServiceProvider();

        var filter = new ValidationActionFilter(sp);
        var request = new FaceLoginRequest { Email = "x@x.com", Embedding = new float[128], DeviceId = "d", Platform = "android" };
        var (context, next) = CreateContext(request, sp);

        await filter.OnActionExecutionAsync(context, next.Object);

        context.Result.Should().BeNull();
        next.Verify(n => n(), Times.Once);
    }

    [Fact]
    public async Task OnActionExecutionAsync_NullArgument_CallsNext()
    {
        var services = new ServiceCollection();
        var sp = services.BuildServiceProvider();

        var filter = new ValidationActionFilter(sp);
        var (context, next) = CreateContext(null, sp);

        await filter.OnActionExecutionAsync(context, next.Object);

        context.Result.Should().BeNull();
        next.Verify(n => n(), Times.Once);
    }
}
