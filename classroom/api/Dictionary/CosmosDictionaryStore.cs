using System.Net;
using EnglishTutor.Api.Progress;
using Microsoft.Azure.Cosmos;

namespace EnglishTutor.Api.Dictionary;

/// <summary>
/// The class's dictionary in Cosmos DB: database "englishtutor", container "dictionary", partition key /classId.
/// In Azure, infra/main.bicep creates both; against the local emulator they are created on first use.
/// </summary>
public sealed class CosmosDictionaryStore(CosmosClient client, bool createIfMissing) : IDictionaryStore
{
    public const string ContainerName = "dictionary";

    private static readonly PartitionKey Partition = new(DictionaryDocument.Class);
    private static readonly ItemRequestOptions NoContentResponse = new() { EnableContentResponseOnWrite = false };

    private readonly SemaphoreSlim _openLock = new(1, 1);
    private Container? _container;

    public async Task<DictionaryContent> ReadAllAsync(CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        var topics = new List<TopicDocument>();
        var entries = new List<EntryDocument>();
        var options = new QueryRequestOptions { PartitionKey = Partition };
        using var iterator = container.GetItemQueryIterator<DictionaryDocument>("SELECT * FROM c", requestOptions: options);
        while (iterator.HasMoreResults)
        {
            foreach (var document in await iterator.ReadNextAsync(cancellationToken))
            {
                switch (document)
                {
                    case TopicDocument topic: topics.Add(topic); break;
                    case EntryDocument entry: entries.Add(entry); break;
                }
            }
        }
        return new DictionaryContent(topics, entries);
    }

    public async Task<StoredDocument<T>?> GetAsync<T>(string id, CancellationToken cancellationToken) where T : DictionaryDocument
    {
        var container = await ContainerAsync(cancellationToken);
        try
        {
            var response = await container.ReadItemAsync<DictionaryDocument>(id, Partition, cancellationToken: cancellationToken);
            return response.Resource is T document ? new StoredDocument<T>(document, response.ETag) : null;
        }
        catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<bool> TryCreateAsync(DictionaryDocument document, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        try
        {
            await container.CreateItemAsync(document, Partition, NoContentResponse, cancellationToken);
            return true;
        }
        catch (CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict)
        {
            return false;
        }
    }

    public async Task<bool> TryReplaceAsync(DictionaryDocument document, string etag, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        var options = new ItemRequestOptions { IfMatchEtag = etag, EnableContentResponseOnWrite = false };
        try
        {
            await container.ReplaceItemAsync(document, document.Id, Partition, options, cancellationToken);
            return true;
        }
        catch (CosmosException e) when (e.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task<bool> TryDeleteAsync(string id, string etag, CancellationToken cancellationToken)
    {
        var container = await ContainerAsync(cancellationToken);
        var options = new ItemRequestOptions { IfMatchEtag = etag };
        try
        {
            await container.DeleteItemAsync<DictionaryDocument>(id, Partition, options, cancellationToken);
            return true;
        }
        catch (CosmosException e) when (e.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    private async Task<Container> ContainerAsync(CancellationToken cancellationToken)
    {
        if (_container is not null) return _container;
        await _openLock.WaitAsync(cancellationToken);
        try
        {
            return _container ??= createIfMissing
                ? await CreateContainerAsync(cancellationToken)
                : client.GetContainer(CosmosProgressStore.DatabaseName, ContainerName);
        }
        finally
        {
            _openLock.Release();
        }
    }

    private async Task<Container> CreateContainerAsync(CancellationToken cancellationToken)
    {
        Database database = await client.CreateDatabaseIfNotExistsAsync(CosmosProgressStore.DatabaseName, cancellationToken: cancellationToken);
        return await database.CreateContainerIfNotExistsAsync(new ContainerProperties(ContainerName, "/classId"), cancellationToken: cancellationToken);
    }
}
