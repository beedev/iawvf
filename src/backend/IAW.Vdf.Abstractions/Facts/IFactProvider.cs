using IAW.Vdf.Abstractions.Triggers;

namespace IAW.Vdf.Abstractions.Facts;

/// <summary>Assembles the fact document for a given trigger. The host supplies the implementation that gathers facts.</summary>
public interface IFactProvider
{
    /// <summary>Assembles the facts relevant to the supplied trigger.</summary>
    /// <param name="trigger">The trigger initiating evaluation.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>The assembled fact document.</returns>
    Task<FactDocument> AssembleAsync(Trigger trigger, CancellationToken cancellationToken = default);
}
