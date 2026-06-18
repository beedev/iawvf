using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace IAW.Vdf.Api.Infrastructure;

/// <summary>
/// Terminal exception handler that converts any unhandled exception into an RFC 7807
/// <see cref="ProblemDetails"/> response. Stack traces and exception messages are logged server-side but
/// NEVER returned to clients; the response body carries only a generic title and a correlation
/// (trace) identifier so an operator can locate the full detail in the logs.
/// </summary>
public sealed class ProblemDetailsExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ProblemDetailsExceptionMiddleware> _logger;

    /// <summary>Creates the middleware.</summary>
    /// <param name="next">The next delegate in the pipeline.</param>
    /// <param name="logger">The logger.</param>
    public ProblemDetailsExceptionMiddleware(RequestDelegate next, ILogger<ProblemDetailsExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    /// <summary>Invokes the middleware.</summary>
    /// <param name="context">The HTTP context.</param>
    /// <returns>A task representing the request.</returns>
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            // Log full detail server-side only. Do not echo to the client.
            _logger.LogError(ex, "Unhandled exception processing {Method} {Path} (trace {TraceId}).",
                context.Request.Method, context.Request.Path, context.TraceIdentifier);

            if (context.Response.HasStarted)
            {
                throw;
            }

            var problem = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred.",
                Detail = "The request could not be completed. Contact support with the trace identifier.",
                Type = "https://httpstatuses.com/500",
                Instance = context.Request.Path,
            };
            problem.Extensions["traceId"] = context.TraceIdentifier;

            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsync(
                JsonSerializer.Serialize(problem)).ConfigureAwait(false);
        }
    }
}
