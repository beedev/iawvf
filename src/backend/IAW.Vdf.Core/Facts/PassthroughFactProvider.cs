using IAW.Vdf.Abstractions.Facts;
using IAW.Vdf.Abstractions.Triggers;

namespace IAW.Vdf.Core.Facts;

/// <summary>
/// A trivial <see cref="IFactProvider"/> that returns a fact document handed to it at construction.
/// The engine consumes the facts supplied on the <c>EvaluationRequest</c>, so this provider exists mainly
/// for hosts that want a no-op assembler. Returns an empty document when none was supplied.
/// </summary>
public sealed class PassthroughFactProvider : IFactProvider
{
    private readonly FactDocument _facts;

    /// <summary>Creates a passthrough provider over the supplied facts (or an empty document).</summary>
    /// <param name="facts">The facts to return.</param>
    public PassthroughFactProvider(FactDocument? facts = null) => _facts = facts ?? new FactDocument();

    /// <inheritdoc />
    public Task<FactDocument> AssembleAsync(Trigger trigger, CancellationToken cancellationToken = default)
        => Task.FromResult(_facts);
}
