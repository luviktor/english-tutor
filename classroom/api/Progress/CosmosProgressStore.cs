using System.Net;
using Microsoft.Azure.Cosmos;

namespace EnglishTutor.Api.Progress;

/// <summary>
/// Progress documents in Cosmos DB: database "englishtutor", container "progress", partition key /id.
/// In Azure, infra/main.bicep creates both; against the local emulator they are created on first use.
/// </summary>
public sealed class CosmosProgressStore(CosmosClient client, bool createIfMissing) : IProgressStore
{
    public const string DatabaseName = "englishtutor";
    public const string ContainerName = "progress";

    private static readonly ItemRequestOptions NoContentResponse = new() { EnableContentResponseOnWrite = false };

    private readonly SemaphoreSlim _openLock = new(1, 1);
    private Container? _container;

    public async Task<StoredProgress?> GetAsync(string pupilId, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        try
        {
            var response = await container.ReadItemAsync<ProgressDocument>(pupilId, new PartitionKey(pupilId), cancellationToken: cancellationToken);
            return new StoredProgress(response.Resource, response.ETag);
        }
        catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<bool> TryCreateAsync(ProgressDocument document, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        try
        {
            await container.CreateItemAsync(document, new PartitionKey(document.Id), NoContentResponse, cancellationToken);
            return true;
        }
        catch (CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict)
        {
            return false;
        }
    }

    public async Task<bool> TryReplaceAsync(ProgressDocument document, string etag, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        var options = new ItemRequestOptions { IfMatchEtag = etag, EnableContentResponseOnWrite = false };
        try
        {
            await container.ReplaceItemAsync(document, document.Id, new PartitionKey(document.Id), options, cancellationToken);
            return true;
        }
        catch (CosmosException e) when (e.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task<IReadOnlyList<ProgressSummaryRow>> ListSummariesAsync(CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        var query = new QueryDefinition("SELECT c.id, c.revision, c.updatedAt, c.summary FROM c");
        var rows = new List<ProgressSummaryRow>();
        using var iterator = container.GetItemQueryIterator<ProgressSummaryRow>(query);
        while (iterator.HasMoreResults)
        {
            rows.AddRange(await iterator.ReadNextAsync(cancellationToken));
        }
        return rows;
    }

    private async Task<Container> ContainerAsync(CancellationToken cancellationToken)
    {
        if (_container is not null) return _container;
        await _openLock.WaitAsync(cancellationToken);
        try
        {
            return _container ??= createIfMissing
                ? await CreateContainerAsync(cancellationToken)
                : client.GetContainer(DatabaseName, ContainerName);
        }
        finally
        {
            _openLock.Release();
        }
    }

    private async Task<Container> CreateContainerAsync(CancellationToken cancellationToken)
    {
        Database database = await client.CreateDatabaseIfNotExistsAsync(DatabaseName, cancellationToken: cancellationToken);
        var properties = new ContainerProperties(ContainerName, "/id");
        properties.IndexingPolicy.ExcludedPaths.Add(new ExcludedPath { Path = "/data/*" });
        return await database.CreateContainerIfNotExistsAsync(properties, cancellationToken: cancellationToken);
    }
}
