using System.Text.Json;
using FluentAssertions;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Moq;
using PlantonHub.API.Middleware;
using PlantonHub.Application.Exceptions;

namespace PlantonHub.UnitTests.Middleware;

/// <summary>
/// Validates: Requirements 1.2, 3.1
/// Tests exception-to-HTTP-code mapping in ExceptionHandlingMiddleware.
/// </summary>
public class ExceptionHandlingMiddlewareTests
{
    private readonly Mock<ILogger<ExceptionHandlingMiddleware>> _loggerMock;

    public ExceptionHandlingMiddlewareTests()
    {
        _loggerMock = new Mock<ILogger<ExceptionHandlingMiddleware>>();
    }

    private (ExceptionHandlingMiddleware middleware, DefaultHttpContext context) CreateMiddleware(Exception exception)
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        RequestDelegate next = _ => throw exception;
        var middleware = new ExceptionHandlingMiddleware(next, _loggerMock.Object);

        return (middleware, context);
    }

    private async Task<(int statusCode, Dictionary<string, JsonElement> body)> InvokeAndGetResponse(Exception exception)
    {
        var (middleware, context) = CreateMiddleware(exception);

        await middleware.InvokeAsync(context);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var responseBody = await new StreamReader(context.Response.Body).ReadToEndAsync();
        var body = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(responseBody)!;

        return (context.Response.StatusCode, body);
    }

    [Fact]
    public async Task InvokeAsync_UnauthorizedException_Returns401()
    {
        var (statusCode, body) = await InvokeAndGetResponse(new UnauthorizedException("Invalid credentials"));

        statusCode.Should().Be(StatusCodes.Status401Unauthorized);
        body["title"].GetString().Should().Be("Unauthorized");
        body["status"].GetInt32().Should().Be(401);
        body["detail"].GetString().Should().Be("Invalid credentials");
    }

    [Fact]
    public async Task InvokeAsync_ForbiddenException_Returns403()
    {
        var (statusCode, body) = await InvokeAndGetResponse(new ForbiddenException("Access denied"));

        statusCode.Should().Be(StatusCodes.Status403Forbidden);
        body["title"].GetString().Should().Be("Forbidden");
        body["status"].GetInt32().Should().Be(403);
        body["detail"].GetString().Should().Be("Access denied");
    }

    [Fact]
    public async Task InvokeAsync_NotFoundException_Returns404()
    {
        var (statusCode, body) = await InvokeAndGetResponse(new NotFoundException("Resource not found"));

        statusCode.Should().Be(StatusCodes.Status404NotFound);
        body["title"].GetString().Should().Be("Not Found");
        body["status"].GetInt32().Should().Be(404);
        body["detail"].GetString().Should().Be("Resource not found");
    }

    [Fact]
    public async Task InvokeAsync_ConflictException_Returns409()
    {
        var (statusCode, body) = await InvokeAndGetResponse(new ConflictException("Duplicate check-in"));

        statusCode.Should().Be(StatusCodes.Status409Conflict);
        body["title"].GetString().Should().Be("Conflict");
        body["status"].GetInt32().Should().Be(409);
        body["detail"].GetString().Should().Be("Duplicate check-in");
    }

    [Fact]
    public async Task InvokeAsync_ValidationException_Returns400WithErrors()
    {
        var failures = new List<ValidationFailure>
        {
            new("Email", "O campo email é obrigatório."),
            new("Password", "A senha deve ter no mínimo 8 caracteres.")
        };
        var validationException = new ValidationException(failures);

        var (statusCode, body) = await InvokeAndGetResponse(validationException);

        statusCode.Should().Be(StatusCodes.Status400BadRequest);
        body["title"].GetString().Should().Be("Validation Error");
        body["status"].GetInt32().Should().Be(400);
        body.Should().ContainKey("errors");
    }

    [Fact]
    public async Task InvokeAsync_BadRequestException_Returns400()
    {
        var (statusCode, body) = await InvokeAndGetResponse(new BadRequestException("Invalid input"));

        statusCode.Should().Be(StatusCodes.Status400BadRequest);
        body["title"].GetString().Should().Be("Bad Request");
        body["status"].GetInt32().Should().Be(400);
        body["detail"].GetString().Should().Be("Invalid input");
    }

    [Fact]
    public async Task InvokeAsync_UnhandledException_Returns500()
    {
        var (statusCode, body) = await InvokeAndGetResponse(new InvalidOperationException("Something went wrong"));

        statusCode.Should().Be(StatusCodes.Status500InternalServerError);
        body["title"].GetString().Should().Be("Internal Server Error");
        body["status"].GetInt32().Should().Be(500);
        body["detail"].GetString().Should().Be("An unexpected error occurred.");
    }

    [Fact]
    public async Task InvokeAsync_UnhandledException_LogsError()
    {
        var exception = new InvalidOperationException("Unexpected failure");
        var (middleware, context) = CreateMiddleware(exception);

        await middleware.InvokeAsync(context);

        _loggerMock.Verify(
            x => x.Log(
                LogLevel.Error,
                It.IsAny<EventId>(),
                It.IsAny<It.IsAnyType>(),
                exception,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task InvokeAsync_ResponseContentType_IsApplicationProblemJson()
    {
        var (middleware, context) = CreateMiddleware(new NotFoundException("Not found"));

        await middleware.InvokeAsync(context);

        context.Response.ContentType.Should().Be("application/problem+json");
    }

    [Fact]
    public async Task InvokeAsync_NoException_PassesThrough()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        var wasCalled = false;

        RequestDelegate next = _ =>
        {
            wasCalled = true;
            return Task.CompletedTask;
        };
        var middleware = new ExceptionHandlingMiddleware(next, _loggerMock.Object);

        await middleware.InvokeAsync(context);

        wasCalled.Should().BeTrue();
        context.Response.StatusCode.Should().Be(200);
    }
}
